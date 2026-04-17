"""SFTP docker-compose.yml + docker-compose-base.yml to SGAI EC2 (same key as Lambda)."""
import os
import sys
import tempfile

import boto3
import paramiko

REGION = "eu-north-1"
BUCKET = "sgai-production-bucket"
KEY = "LLM_14.pem"
HOST = "13.49.16.179"
USER = "ubuntu"
REMOTE_DIR = "/home/ubuntu/workspace/ragflow/docker"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [
    os.path.join(ROOT, "docker", "docker-compose.yml"),
    os.path.join(ROOT, "docker", "docker-compose-base.yml"),
]


def main():
    for f in FILES:
        if not os.path.isfile(f):
            print("Missing", f, file=sys.stderr)
            sys.exit(1)

    pem = os.path.join(tempfile.gettempdir(), "LLM_14_sftp.pem")
    boto3.client("s3", region_name=REGION).download_file(BUCKET, KEY, pem)
    os.chmod(pem, 0o600)
    pk = paramiko.RSAKey.from_private_key_file(pem)

    t = paramiko.Transport((HOST, 22))
    t.connect(username=USER, pkey=pk)
    sftp = paramiko.SFTPClient.from_transport(t)
    for local in FILES:
        name = os.path.basename(local)
        remote = f"{REMOTE_DIR}/{name}"
        print("put", local, "->", remote)
        sftp.put(local, remote)
    sftp.close()
    t.close()
    print("SFTP done.")


if __name__ == "__main__":
    main()
