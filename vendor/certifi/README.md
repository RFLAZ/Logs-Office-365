# Bundled Mozilla CA certificates

Unmodified `certifi` 2026.10.19 CA bundle, extracted from its official PyPI wheel after verifying the wheel SHA-256 against the version-specific PyPI JSON metadata. `provenance.json` records the source and checksums. The package script verifies the CA bundle checksum again before embedding it in `iniciar.py`.

This public CA bundle supplements Python's configured default trust store, including on macOS installations without working default roots. TLS certificate validation and hostname checking remain required. No certificates are downloaded or installed on the user's machine at runtime. No credentials or private keys are included. The standalone Python file contains the bundle and needs no Python packages.

Update only from a verified official certifi release, retaining its license and updating provenance. Do not modify certificate contents or disable TLS verification to work around connection failures.
