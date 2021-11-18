const fileNameEscReg = /[^a-z0-9$_-]+/gi;
const leadingOrTrailingDashReg = /^-|-$/;

export default function escapeFilename(str: string) {
  return str.replace(fileNameEscReg, "-").replace(leadingOrTrailingDashReg, "");
}
