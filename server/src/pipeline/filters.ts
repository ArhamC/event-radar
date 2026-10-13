// Events Side Street deliberately leaves out, whatever the source.

// Children's reading programs (storytimes, baby rhyme/book times, kids' and tweens' book clubs).
// Adult reading is in scope: book clubs, literacy, reading groups, author and poetry readings.
const KIDS_READING = /story ?time|books for babies|story (and|&) song|dog tales/i;
const BOOK_CLUB = /book club|reading (club|group)|read the/i;
const KIDS_AUDIENCE = /\b(kids?|child(ren)?|tweens?|teens?|junior|youth)\b|\bages? \d{1,2}\s*[-–]\s*1[0-5]\b|\bages? \d\+/i;
const KIDS_PLACE = /children'?s library/i;

export function isChildrensReading(title: string, venueName = ''): boolean {
  if (KIDS_PLACE.test(venueName)) return true;
  if (KIDS_READING.test(title)) return true;
  return BOOK_CLUB.test(title) && KIDS_AUDIENCE.test(title);
}
