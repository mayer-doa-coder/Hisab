# Voice Release Gate

Decision: BLOCK_RELEASE

## Checks

- voice_evaluation_script: PASS (expected runVoiceEvaluation.cjs exits with code 0, actual passed)
- bn_parser_regression_script: PASS (expected runBnParserRegression.cjs exits with code 0, actual passed)
- intent_accuracy: PASS (expected >= 0.9, actual 0.9992)
- amount_accuracy: PASS (expected >= 0.95, actual 1)
- name_accuracy: PASS (expected >= 0.9, actual 0.9996)
- false_execution_rate: PASS (expected <= 0.02, actual 0)
- cancellation_rate: PASS (expected <= 0.3, actual 0.0011)
- parser_pass_rate: PASS (expected == 1, actual 1)
- pilot_go_no_go: FAIL (expected GO or unavailable, actual NO_GO)

## Blockers

- pilot_go_no_go: expected GO or unavailable, got NO_GO