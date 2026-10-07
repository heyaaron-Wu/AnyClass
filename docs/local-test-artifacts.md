# Local test evidence boundary

Browser and visual tests write generated screenshots and diagnostics outside this repository through `tests/local-artifacts.js`. Set `ANYCLASS_LOCAL_ARTIFACT_ROOT` to an external directory to choose the root. A repository-local path is rejected, including a symlink resolving into the repository.

Without the variable, tests use an existing `anyclass-local-artifacts` directory beside the repository's parent project directory; otherwise they use the operating system's temporary directory under `anyclass-local-artifacts`. No machine-specific path is embedded in the source.

Each suite uses a unique timestamp/process/nonce subdirectory. Evidence is retained after tests finish; tests print their evidence path where applicable. The legacy `ANYCLASS_VISUAL_OUTPUT` switch still enables optional screenshots, but their destination now follows the shared external root.

Tests and deployment workflows should not create `outputs/` inside the repository. Generated release archives and deployment manifests should likewise use `ANYCLASS_LOCAL_ARTIFACT_ROOT` or another verified external destination.
