const globEscReg = /[*?{}()![\]\\]/g;
export default function escapeGlob(str: string) {
  return str.replace(globEscReg, "\\$&");
}
