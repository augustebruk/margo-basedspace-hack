/* Tiny classNames joiner — joins truthy class name args with a space. Avoids a
 * `clsx` dependency. Use for conditional / compound CSS-Module classes. */
export function cx(
  ...args: Array<string | false | null | undefined>
): string {
  return args.filter(Boolean).join(" ");
}
