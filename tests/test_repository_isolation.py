import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def test_repo_contains_one_contract():
 r=json.loads((ROOT/"release.json").read_text())
 assert r["sourceFile"]=="contracts/shiftfair.py"
 assert sorted(p.name for p in (ROOT/"contracts").glob("*.py"))==["shiftfair.py"]
 assert len(r["hash"])==64 and r["chainId"]==61999
 assert "GIFTEDLOV/shiftfair" in r["repo"]
