"""Convert an operator's OpenSSH Ed25519 key to the release signer's PKCS#8 PEM."""

import argparse
import base64
import getpass
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parent.parent
    destination = args.destination.expanduser().resolve()
    if destination.is_relative_to(repo):
        parser.error("Store the private PEM outside the repository.")

    data = args.source.expanduser().read_bytes()
    try:
        key = serialization.load_ssh_private_key(data, password=None)
    except TypeError:
        password = getpass.getpass("SSH key passphrase: ").encode()
        key = serialization.load_ssh_private_key(data, password=password)
    if not isinstance(key, Ed25519PrivateKey):
        parser.error("The source must be an Ed25519 private key.")

    configured = json.loads((repo / "wrangler.installer.jsonc").read_text())
    expected = base64.b64decode(configured["vars"]["RELEASE_PUBLIC_KEY"], validate=True)
    actual = key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    if actual != expected:
        parser.error("Private key does not match the configured release public key.")

    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    # Refuse overwrites and apply private permissions at file creation time.
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(pem)
    print(f"Created {destination} (unencrypted PKCS#8, mode 0600).")
    print("Public key matches installer configuration; original key unchanged.")


if __name__ == "__main__":
    main()
