const templateLiteralEscapeReg = /`|${/g;

export default function toTemplateLiteral(src: string) {
  return `\`${src.replace(templateLiteralEscapeReg, "\\$&")}\``;
}
