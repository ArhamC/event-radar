// Events Side Street deliberately leaves out, whatever the source.

// Programs for kids (children, tweens, babies, families). Teen and adult programs are in scope,
// and so are adult book clubs, literacy and reading groups.
const KIDS_READING = /story ?time|books for babies|story (and|&) song|dog tales/i;
// Words that only ever describe a kids' program
const KID_ONLY = /\b(toddlers?|preschool(ers)?|infants?|tweens?|playgroup|earlyon|caregivers?)\b|\bfrom birth\b|\bages? birth\b|\d+\s*months?\b/i;
// "kids", "family", "baby" are also band names and benefit gigs ("Incognito Baby", "Concert for
// the Kids"), so they only count in the forms program listings use
const KID_LABEL = new RegExp(
  [
    String.raw`\((kids?|children|family|junior|bab(y|ies))\)`, // "Make and Play (Family)"
    String.raw`^(kids?|children'?s?|family|bab(y|ies)|junior)\b`, // "Kids Art Afternoon", "Family Movie Mondays"
    String.raw`\bfor (kids|children|babies|toddlers|tweens)\b`, // "Chess for Kids"
    String.raw`\bwith (a |your )?(baby|babies|toddlers?|child|kids)\b`, // "Book Club with a Baby"
  ].join('|'),
  'i'
);
const OLDER = /\b(teens?|adults?)\b/i; // "(Teen)", "Teen Drop-In", "(Adult)"
const KIDS_PLACE = /children'?s library/i;

// "Ages 6-12", "Ages 8-14" -> a kids' program; "Ages 4+", "Age 8+", "Ages 10+" -> kids' too;
// "Ages 11+", "Ages 16+", "Ages 55+" are open to teens/adults.
function kidsAgeRange(title: string): boolean {
  const range = /\bages?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\b(?!\s*months?)/i.exec(title);
  if (range) return Number(range[1]) < 12 && Number(range[2]) <= 14;
  const plus = /\bages?\s*(\d{1,2})\s*\+/i.exec(title);
  if (plus) return Number(plus[1]) <= 10;
  return false;
}

export function isForKids(title: string, venueName = ''): boolean {
  if (KIDS_PLACE.test(venueName)) return true;
  if (KIDS_READING.test(title)) return true;
  if (OLDER.test(title)) return false;
  return KID_ONLY.test(title) || KID_LABEL.test(title) || kidsAgeRange(title);
}
