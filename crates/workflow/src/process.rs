use anyhow::{ensure, Context, Result};
use serde_json::Value;
use std::path::Path;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
#[cfg(windows)]
pub fn is_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    unsafe {
        use windows_sys::Win32::{Foundation::CloseHandle, System::Threading::*};
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return false;
        }
        let mut code = 0;
        let alive = GetExitCodeProcess(h, &mut code) != 0 && code == 259;
        CloseHandle(h);
        alive
    }
}
#[cfg(not(windows))]
pub fn is_alive(pid: u32) -> bool {
    pid != 0 && Path::new(&format!("/proc/{pid}")).exists()
}
#[cfg(windows)]
struct Job(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
unsafe impl Send for Job {}
#[cfg(windows)]
impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(windows)]
impl Job {
    fn attach(child: &tokio::process::Child) -> Result<Self> {
        unsafe {
            use windows_sys::Win32::{
                Foundation::*,
                System::{Diagnostics::ToolHelp::*, JobObjects::*, Threading::*},
            };
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            ensure!(!handle.is_null(), "Cannot create Windows Job Object");
            let job = Job(handle);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            ensure!(
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as _,
                    std::mem::size_of_val(&limits) as u32
                ) != 0,
                "Cannot configure process group"
            );
            ensure!(
                AssignProcessToJobObject(
                    handle,
                    child.raw_handle().context("Missing process handle")? as _
                ) != 0,
                "Cannot assign process to Job Object"
            );
            let pid = child.id().context("Missing process ID")?;
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            ensure!(
                snapshot != INVALID_HANDLE_VALUE,
                "Cannot inspect suspended process"
            );
            let mut entry: THREADENTRY32 = std::mem::zeroed();
            entry.dwSize = std::mem::size_of_val(&entry) as u32;
            let mut more = Thread32First(snapshot, &mut entry);
            let mut resumed = false;
            while more != 0 {
                if entry.th32OwnerProcessID == pid {
                    let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                    if !thread.is_null() {
                        resumed = ResumeThread(thread) != u32::MAX;
                        CloseHandle(thread);
                        break;
                    }
                }
                more = Thread32Next(snapshot, &mut entry);
            }
            CloseHandle(snapshot);
            ensure!(resumed, "Cannot resume assigned process");
            Ok(job)
        }
    }
}
async fn bounded(mut stream: impl tokio::io::AsyncRead + Unpin) -> Result<Vec<u8>> {
    let mut out = vec![];
    (&mut stream).take(2_000_001).read_to_end(&mut out).await?;
    ensure!(out.len() <= 2_000_000, "Process output exceeds 2 MB");
    Ok(out)
}
pub async fn execute(
    executable: &Path,
    args: &[String],
    source: &str,
    extension: &str,
    input: &Value,
    directory: &Path,
) -> Result<Value> {
    ensure!(executable.is_file(), "Configured executable is unavailable");
    ensure!(
        ["py", "js", "mjs", "txt"].contains(&extension),
        "Choose py, js, mjs or txt script format"
    );
    tokio::fs::create_dir_all(directory).await?;
    let script = tempfile::Builder::new()
        .prefix("script-")
        .suffix(&format!(".{extension}"))
        .tempfile_in(directory)?;
    tokio::fs::write(script.path(), source).await?;
    let mut command = tokio::process::Command::new(executable);
    command
        .args(args)
        .arg(script.path())
        .current_dir(directory)
        .env_clear()
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    // Explicit minimal environment; no inherited provider credentials.
    for name in ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP"] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    #[cfg(windows)]
    command.creation_flags(0x08000000 | 0x00000004); // hidden and suspended until assigned
    let mut child = command
        .spawn()
        .context("Could not start configured executable")?;
    #[cfg(windows)]
    let _job = Job::attach(&child)?;
    let mut stdin = child.stdin.take().context("Missing process input")?;
    let stdout = child.stdout.take().context("Missing stdout")?;
    let stderr = child.stderr.take().context("Missing stderr")?;
    let bytes = serde_json::to_vec(input)?;
    let (status, out, _err, ()) = tokio::try_join!(
        async { Ok::<_, anyhow::Error>(child.wait().await?) },
        bounded(stdout),
        bounded(stderr),
        async {
            stdin.write_all(&bytes).await?;
            stdin.shutdown().await?;
            drop(stdin);
            Ok::<_, anyhow::Error>(())
        }
    )?;
    ensure!(
        status.success(),
        "Process exited with {}. Its output was not applied.",
        status
            .code()
            .map_or("no exit code".into(), |n| n.to_string())
    );
    serde_json::from_slice(&out).context("Process stdout must contain one JSON value")
}
