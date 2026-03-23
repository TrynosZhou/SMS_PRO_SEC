/**
 * Formal display name for teacher dashboards:
 * - Male: "Mr {lastName} {firstName}" e.g. Mr Zhou Trynos
 * - Female: "Mrs {lastName} {firstInitial}" e.g. Mrs Mudzimiri S
 */
export function formatTeacherTitleName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  gender: string | null | undefined
): string {
  const fn = (firstName || '').trim();
  const ln = (lastName || '').trim();
  const g = (gender || '').trim().toLowerCase();

  const isMale = g === 'male' || g === 'm' || g.startsWith('male');
  const isFemale = g === 'female' || g === 'f' || g.startsWith('female');

  if (isMale && ln) {
    return `Mr ${ln}${fn ? ` ${fn}` : ''}`.trim();
  }
  if (isFemale && ln) {
    const initial = fn ? fn.charAt(0).toUpperCase() : '';
    return `Mrs ${ln}${initial ? ` ${initial}` : ''}`.trim();
  }

  return [fn, ln].filter(Boolean).join(' ').trim() || 'Teacher';
}
