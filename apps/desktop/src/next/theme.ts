export function themeFor(background: string) {
  const rgb = background
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));
  const luminance = rgb
    .map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
  const light = luminance > 0.179;
  const mix = (target: number, weight: number) =>
    "#" +
    rgb
      .map((c) =>
        Math.round(c * (1 - weight) + target * weight)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  return {
    "--surface": background,
    "--panel": mix(light ? 255 : 0, 0.18),
    "--raised": mix(255, light ? 0.28 : 0.025),
    "--input": mix(light ? 0 : 255, 0.055),
    "--hover": mix(light ? 0 : 255, 0.1),
    "--line": mix(light ? 0 : 255, 0.2),
    "--line-strong": mix(light ? 0 : 255, 0.32),
    "--text": light ? "#111111" : "#ffffff",
    "--muted": mix(light ? 0 : 255, light ? 0.78 : 0.74),
    colorScheme: light ? "light" : "dark",
  };
}
