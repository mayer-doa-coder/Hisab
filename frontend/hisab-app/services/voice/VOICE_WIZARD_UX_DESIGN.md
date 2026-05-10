# Voice Wizard UX (Phase 4)

## Screen Flow

1. Intent step: choose action (baki/joma/becha)
2. Name step: capture one customer name
3. Amount step: capture one numeric amount
4. Date step: optional (`aj`, `kal`, ISO date)
5. Review step: editable summary
6. Confirm step: final confirmation

Each screen accepts one field only to reduce cognitive load.

## UI Component Structure

- `VoiceStepScreen`: common frame with step label + bilingual prompts
- `HeardTokenDisplay`: heard token and confidence meter
- `ConfidenceIndicator`: high/medium/low confidence bar
- `CorrectionPanel`: retry/change/suggestion actions
- `ReviewScreen`: full command summary and edit shortcuts

## Prompt Text (Bengali + English)

- Intent: `কি করতে চান?` / `What do you want to do?`
- Name: `নাম বলুন` / `Say customer name`
- Amount: `কত টাকা?` / `How much amount?`
- Date: `তারিখ বলুন (ঐচ্ছিক)` / `Say date (optional)`
- Review: `সারাংশ দেখুন` / `Review parsed command`
- Confirm: `... যোগ করবো?` / `Confirm this action?`

## Correction Logic

- Low confidence: show warning and ask to retry
- Ambiguous name: show top suggestions (for example Rahim/Karim)
- Instant fixes: `Change Name`, `Change Amount`, `Change Date`, `Retry Voice`
- Review screen allows direct step jump for correction

## Failure Paths

- No speech: prompt retry with clear next action
- Invalid token for state: keep user on same step, show simple prompt again
- ASR low confidence: keep correction options visible

## Example User Journeys

### Journey A: Baki add success
1. User says `baki`
2. User says `Rahim`
3. User says `50`
4. User says `aj`
5. Review and confirm
6. Command executes

### Journey B: Wrong name recovered
1. User says name with low confidence
2. App shows: `আপনি কি রহিম বলতে চেয়েছিলেন?`
3. User taps `Rahim`
4. Flow continues to amount step

### Journey C: Date skipped
1. User provides intent/name/amount
2. On date step user taps `Skip`
3. Flow moves to review
4. User confirms
