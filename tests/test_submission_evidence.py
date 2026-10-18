import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def test_release_links_evidence_and_sources_are_complete():
 r=json.loads((ROOT/"release.json").read_text())
 fields=json.loads((ROOT/"docs"/"SUBMISSION_FIELDS.json").read_text())
 e=json.loads((ROOT/"evidence"/"shiftfair-live.json").read_text())
 required=("projectName","shortDescription","detailedDescription","problemSolved","whyGenLayer","semanticConsensus","githubRepository","chainId","contractAddress","explorerUrl","sourceSha256","qualificationCase","terminalVerdict","knownLimitations")
 assert all(fields.get(k) for k in required)
 assert all(isinstance(fields.get(k),str) and fields[k].startswith("https://") for k in ("githubRepository","explorerUrl"))
 assert e["caseId"]==r["case"] and e["verdict"]==r["verdict"] and e["state"]=="PASS"
 assert hashlib.sha256((ROOT/r["sourceFile"]).read_bytes()).hexdigest()==r["hash"]
 assert re.fullmatch(r"0x[0-9a-fA-F]{40}",r["address"])
 assert all(re.fullmatch(r"0x[0-9a-fA-F]{64}",r[k]) for k in ("firstRoundTx","secondRoundTx","finalizationTx"))
 assert not any(x in (ROOT/"docs"/"SUBMISSION.md").read_text().lower() for x in ("todo","tbd","placeholder"))
