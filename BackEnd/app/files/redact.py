# Hides personal info in the text pulled from uploaded files,
# before any of it is saved or sent to the AI.
#
# Uses Microsoft Presidio. Presidio finds personal info two ways:
# - Patterns, for things with a fixed shape (emails, phone numbers, card numbers)
# - A language model, for things like names that have no fixed shape
#
# Each piece of personal info is swapped for a numbered label:
#   "Call Jane Smith at 555-123-4567. Jane approved it."
#   becomes
#   "Call [PERSON_1] at [PHONE_NUMBER_1]. [PERSON_1] approved it."
#
# Numbering keeps different people apart, so the AI can still tell
# who did what, without ever seeing their real details.
#
# Redaction is never perfect. It can miss unusual names or flag a word
# that isn't a name. It lowers the risk a lot, but it isn't a guarantee.

import re
from functools import lru_cache

from presidio_analyzer import AnalyzerEngine, RecognizerResult
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

# The kinds of personal info we hide.
# Dates and places are left alone on purpose. A handover guide needs
# deadlines and office locations to make sense.
ENTITIES = [
    "PERSON",
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "CREDIT_CARD",
    "US_SSN",
    "US_BANK_NUMBER",
    "IBAN_CODE",
    "IP_ADDRESS",
]

# Words the language model sometimes mistakes for names, especially at the
# start of a heading. These are never hidden. Add to this list when you
# spot a new false alarm.
NEVER_NAMES = [
    "Unfinished",
    "Known",
    "Key",
    "Attendees",
    "Decision",
    "Action",
    "Owner",
    "Status",
    "Task",
    "Due",
    "Follow-up",
]

# How sure Presidio has to be before it hides something, from 0 to 1.
# Lower hides more, but also hides more things that aren't personal info.
SCORE_THRESHOLD = 0.4

# The language model can only read about 1 million characters at once,
# so long text is handled in pieces of this size.
CHUNK_SIZE = 100_000

# Name parts shorter than this aren't used for "name memory" (see below),
# so initials like "J" don't wipe out every capital J.
MIN_NAME_PART_LENGTH = 3

# Matches one of our labels, like [PERSON_3], so we can renumber them.
LABEL_PATTERN = re.compile(r"\[([A-Z_]+?)_(\d+)\]")


@lru_cache
def get_analyzer():
    """Loads Presidio's finder once. The first load takes a few seconds."""
    return AnalyzerEngine()


@lru_cache
def get_anonymizer():
    """Loads Presidio's replacer once."""
    return AnonymizerEngine()


def split_into_chunks(text):
    """Splits long text into pieces, cutting at line breaks where possible."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        # Cut at the last line break before the limit, so we don't split a word.
        if end < len(text):
            line_break = text.rfind("\n", start, end)
            if line_break > start:
                end = line_break + 1
        chunks.append(text[start:end])
        start = end
    return chunks


def find_pii(chunk):
    """Asks Presidio to find personal info in one piece of text."""
    return get_analyzer().analyze(
        text=chunk,
        entities=ENTITIES,
        language="en",
        score_threshold=SCORE_THRESHOLD,
        allow_list=NEVER_NAMES,
    )


def add_name_memory(chunk, findings, name_parts):
    """Hides first or last names that appear on their own.

    The language model often misses a lone first name, like "Jordan"
    (it may think it's the country). But if "Jordan Rivera" was found
    anywhere in the file, we know "Jordan" is a person here too.
    """
    # Spots already covered, so we don't hide the same text twice.
    covered = [(f.start, f.end) for f in findings]

    extra = []
    for part in name_parts:
        # Whole words only, matching the same capital letters.
        for match in re.finditer(rf"\b{re.escape(part)}\b", chunk):
            inside_existing = any(
                start <= match.start() and match.end() <= end for start, end in covered
            )
            if not inside_existing:
                extra.append(
                    RecognizerResult(
                        entity_type="PERSON",
                        start=match.start(),
                        end=match.end(),
                        score=0.6,
                    )
                )
    return findings + extra


def renumber_in_reading_order(text):
    """Renumbers labels so they count up from the top of the text.

    Presidio replaces from the end of the text backward, which numbers
    things bottom to top. This flips it so the first person mentioned
    is [PERSON_1].
    Returns the renumbered text and how many of each kind there are.
    """
    new_numbers = {}
    counts = {}

    def renumber(match):
        old_label = match.group(0)
        entity_type = match.group(1)
        if old_label not in new_numbers:
            counts[entity_type] = counts.get(entity_type, 0) + 1
            new_numbers[old_label] = f"[{entity_type}_{counts[entity_type]}]"
        return new_numbers[old_label]

    return LABEL_PATTERN.sub(renumber, text), counts


def redact_text(text):
    """Hides personal info in the text.

    Returns two things:
    - the cleaned text
    - a summary of how many different values of each kind were hidden,
      like {"PERSON": 3, "EMAIL_ADDRESS": 1}
      The summary never includes the personal info itself.
    """
    chunks = split_into_chunks(text)

    # First pass: find everything, and collect the parts of every full name.
    all_findings = []
    # Maps each name part to its full name, like "jordan" -> "jordan rivera".
    name_parts = {}
    for chunk in chunks:
        findings = find_pii(chunk)
        all_findings.append(findings)
        for finding in findings:
            if finding.entity_type != "PERSON":
                continue
            full_name = chunk[finding.start : finding.end]
            words = full_name.split()
            if len(words) > 1:
                for word in words:
                    if len(word) >= MIN_NAME_PART_LENGTH and word not in NEVER_NAMES:
                        name_parts.setdefault(word, full_name.lower())

    # Labels: each real value gets one label, reused every time it appears.
    labels = {}
    label_counts = {}

    def make_labeler(entity_type):
        """Makes the function that picks the label for one kind of info."""

        def label(original):
            value = original.strip()
            # A lone first or last name shares the label of its full name.
            if entity_type == "PERSON":
                key_value = name_parts.get(value, value.lower())
            else:
                key_value = value.lower()
            key = (entity_type, key_value)
            if key not in labels:
                label_counts[entity_type] = label_counts.get(entity_type, 0) + 1
                labels[key] = f"[{entity_type}_{label_counts[entity_type]}]"
            return labels[key]

        return label

    operators = {
        entity: OperatorConfig("custom", {"lambda": make_labeler(entity)})
        for entity in ENTITIES
    }

    # Second pass: add the name memory finds, then swap everything for labels.
    cleaned_chunks = []
    for chunk, findings in zip(chunks, all_findings):
        findings = add_name_memory(chunk, findings, name_parts)
        result = get_anonymizer().anonymize(
            text=chunk,
            analyzer_results=findings,
            operators=operators,
        )
        cleaned_chunks.append(result.text)

    cleaned, summary = renumber_in_reading_order("".join(cleaned_chunks))

    # Drop the real values from memory now that we're done with them.
    labels.clear()
    name_parts.clear()

    return cleaned, summary
