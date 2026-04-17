"""Upload lambda_function_updated.zip to AWS StartEC2InstanceAndForward (boto3)."""
import os
import sys

import boto3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = os.path.join(ROOT, "lambda_function_updated.zip")
FN = "StartEC2InstanceAndForward"
REGION = "eu-north-1"


def main():
    if not os.path.isfile(ZIP):
        print("Missing", ZIP, file=sys.stderr)
        sys.exit(1)
    data = open(ZIP, "rb").read()
    print("Uploading", len(data), "bytes...")
    c = boto3.client("lambda", region_name=REGION)
    r = c.update_function_code(FunctionName=FN, ZipFile=data)
    print("OK", r.get("LastModified"), r.get("CodeSha256"))


if __name__ == "__main__":
    main()
