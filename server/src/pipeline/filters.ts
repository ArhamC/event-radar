// Events Side Street deliberately leaves out, whatever the source.

// Programs for kids (children, tweens, babies, families). Teen and adult programs are in scope,
// and so are adult book clubs, literacy and reading groups.
const KIDS_READING = /story ?time|books for babies|story (and|&) song|dog tales/i;
const KID_WORDS =
  /\b(kids?|child(ren)?|toddlers?|bab(y|ies)|infants?|preschool(ers)?|tweens?|junior|family|playgroup|earlyon|caregivers?)\b|\bfrom birth\b|\bages? birth\b|\d+\s*months?\b/i;
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
  return KID_WORDS.test(title) || kidsAgeRange(title);
}
