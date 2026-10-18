"""V4 release-source regression, with mocked GenLayer consensus API.
This IS NOT an actual GenVM execution; live chain verification is separate.
"""
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch
import pytest
ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture(params=['shiftfair'])
def env(request):
    slug=request.param
    fspec=importlib.util.spec_from_file_location(f'fixture_v4_{slug}',ROOT/'tests'/'_fixture.py')
    fixture=importlib.util.module_from_spec(fspec);fspec.loader.exec_module(fixture)
    spec=importlib.util.spec_from_file_location(f'candidate_v4_{slug}',ROOT/'contracts'/f'{slug}.py')
    cand=importlib.util.module_from_spec(spec);spec.loader.exec_module(cand)
    cand._now=lambda:fixture.CLOCK[0]
    fixture.gl.message.sender_address.as_hex=fixture.A
    fixture.MODEL[0]=dict(fixture.semantics)
    fixture.PROMPTS.clear()
    contract=getattr(cand,fixture.CLASS)()
    # Attestor must be a third actor and a distinct wallet.
    attestor=fixture.C
    case='review-v4-case'
    args=[case,fixture.Address(fixture.B),'Case rule established at creation',fixture.CLOCK[0]+3600]+list(fixture.initial)+[fixture.Address(attestor)]
    class Context:
        def __init__(self):self.c=cand;self.f=fixture;self.obj=contract;self.args=args;self.case=case;self.attestor=attestor
        def actor(self, address): self.f.gl.message.sender_address.as_hex=address
        def rec(self):return json.loads(self.obj.get_case(case))
        def prepare(self, attested=False):
            self.actor(self.f.A);self.obj.create_case(*args)
            self.actor(self.f.B);self.obj.consent(case)
            self.actor(self.f.A);self.obj.freeze(case)
            d=self.obj.submit_evidence(case,'Signed third-party manifest: amount/shift/delivery/notice requirements substantiated.')
            if attested:self.actor(self.attestor);self.obj.attest_evidence(case,d,'source-record:immutable-id:v4');self.actor(self.f.A)
            return d
    return Context()


def test_v4_source_and_schema_metadata(env):
    assert env.c.SCHEMA.endswith('_V4')
    assert 'attest_evidence' in env.c.__dict__ or hasattr(env.obj,'attest_evidence')
    assert 'py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6' in (ROOT/'contracts'/f'{env.f.SLUG}.py').read_text().splitlines()[0]


def test_bad_attestor_rejected(env):
    for attacker in (env.f.A,env.f.B,'0x'+'0'*40, '0x'+'z'*40):
        args=env.args[:-1]+[env.f.Address(attacker)]
        with pytest.raises(env.f.UserError,match='BAD_ATTESTOR'):
            env.obj.create_case(*args)
        assert env.obj.case_ids==[]


def test_requires_provenance_before_semantic_vote(env):
    d=env.prepare()
    with pytest.raises(env.f.UserError,match='BAD_STATE'):
        env.obj.adjudicate(env.case)
    env.actor(env.attestor)
    with pytest.raises(env.f.UserError,match='ATTESTATION_HASH'):
        env.obj.attest_evidence(env.case,'f'*64,'source:abc')
    env.actor(env.f.A)
    with pytest.raises(env.f.UserError,match='NOT_AUTHORIZED_ATTESTOR'):
        env.obj.attest_evidence(env.case,d,'source:abc')
    env.actor(env.attestor)
    assert len(env.obj.attest_evidence(env.case,d,'source:abc'))==64
    assert env.rec()['status']=='ATTESTED'
    with pytest.raises(env.f.UserError,match='ATTESTATION_STATE'):
        env.obj.attest_evidence(env.case,d,'source:abc')


def test_integrity_gates_before_model_invocation(env):
    env.prepare(attested=True)
    record=env.rec();record['source_ref']='swapped-source-record';env.obj._store(record)
    with pytest.raises(env.f.UserError,match='ATTESTATION_INTEGRITY'):
        env.obj.adjudicate(env.case)
    assert len(env.f.PROMPTS)==0


def test_model_agreement_and_positive_economic_derivation(env):
    env.prepare(attested=True)
    env.actor(env.f.A)
    assert env.obj.adjudicate(env.case)==env.f.positive
    assert len(env.f.PROMPTS)==2
    assert all('attestation_hash' in p and 'untrusted_challenge' in p for p in env.f.PROMPTS)
    state=env.rec()
    assert state['status']=='ASSESSED' and state['round']==1
    if env.f.SLUG=='invoicebasis':
        assert state['payable_minor']==0
        assert state['provisional_payable_minor']==state['gross_minor']*state['rate_num']//state['rate_den']
    if env.f.SLUG=='shiftfair':
        assert state['approved_minutes']==0
        assert state['provisional_approved_minutes']==min(state['requested_minutes'],state['max_minutes'])


def test_independent_validator_disagreement_prevents_state_update(env):
    env.prepare(attested=True)
    n=[]
    def conflicting(prompt,response_format=None):
        n.append(prompt)
        return dict(env.f.semantics) if len(n)==1 else {**env.f.semantics,'evidence_sufficient':False}
    with patch.object(env.f.gl.nondet,'exec_prompt',conflicting):
        with pytest.raises(env.f.UserError,match='VALIDATOR_DISAGREEMENT'):
            env.obj.adjudicate(env.case)
    assert len(n)==2 and env.rec()['round']==0 and env.obj.get_history(env.case)=='[]'


def test_challenge_affects_second_round_and_hash_binding(env):
    env.prepare(attested=True)
    env.actor(env.f.A)
    env.obj.adjudicate(env.case)
    env.actor(env.f.B)
    challenge='The signed manifest does not match the handoff timestamp or scope.'
    env.obj.challenge(env.case,challenge)
    record=env.rec()
    assert challenge in record['challenge_text'] and len(record['challenges'])==1
    assert record['challenge_hash']==env.c._digest(env.c._canon(record['challenges']))
    env.actor(env.f.A);env.obj.challenge(env.case,'The signed issuer confirms scope and date.')
    env.f.CLOCK[0]+=11
    env.f.PROMPTS.clear()
    try:
        env.actor(env.f.A)
        env.obj.adjudicate(env.case)
        assert all(challenge in p and env.rec()['challenge_hash'] in p for p in env.f.PROMPTS)
        history=json.loads(env.obj.get_history(env.case))
        assert len(history)==2 and history[1]['prev']==history[0]['entry_hash']
        with pytest.raises(env.f.UserError,match='CHALLENGE_DENIED'):
            env.obj.challenge(env.case,'illegitimate third vote')
    finally:env.f.CLOCK[0]-=11


def test_challenge_tamper_rejected_before_consensus(env):
    env.prepare(attested=True)
    env.obj.adjudicate(env.case)
    env.obj.challenge(env.case,'Review missing delivery acknowledgement')
    env.actor(env.f.B);env.obj.challenge(env.case,'Independent rebuttal')
    record=env.rec();record['challenge_text']='Changed after freeze';env.obj._store(record)
    env.f.CLOCK[0]+=11
    try:
        with pytest.raises(env.f.UserError,match='CHALLENGE_INTEGRITY'):
            env.obj.adjudicate(env.case)
    finally:env.f.CLOCK[0]-=11


def test_deadline_blocks_late_attestor(env):
    d=env.prepare()
    env.f.CLOCK[0]+=4000
    try:
        env.actor(env.attestor)
        with pytest.raises(env.f.UserError,match='ATTESTATION_DEADLINE'):
            env.obj.attest_evidence(env.case,d,'source:expired')
    finally:env.f.CLOCK[0]-=4000


def test_finalization_immutable_amounts_and_any_actor(env):
    env.prepare(attested=True);env.obj.adjudicate(env.case)
    env.actor(env.f.C)
    with pytest.raises(env.f.UserError,match='CHALLENGE_WINDOW_OPEN'):
        env.obj.finalize_case(env.case)
    env.f.CLOCK[0]+=86401
    try:
        assert env.obj.finalize_case(env.case)==env.f.positive
        r=env.rec();assert r['status']=='FINALIZED' and r['finalized_at']>0
        if env.f.SLUG=='invoicebasis':
            assert r['payable_minor']==r['provisional_payable_minor']
        if env.f.SLUG=='shiftfair':
            assert r['approved_minutes']==r['provisional_approved_minutes']
        with pytest.raises(env.f.UserError,match='FINALIZATION_STATE'):
            env.obj.finalize_case(env.case)
        with pytest.raises(env.f.UserError,match='CHALLENGE_DENIED'):
            env.obj.challenge(env.case,'Too late')
    finally:env.f.CLOCK[0]-=86401

def test_challenge_round2_can_finalize_without_waiting_extra_day(env):
    env.prepare(attested=True);env.obj.adjudicate(env.case)
    env.actor(env.f.B);env.obj.challenge(env.case,'Second review of signed manifest')
    env.actor(env.f.A);env.obj.challenge(env.case,'Our response to that review')
    env.f.CLOCK[0]+=11
    try:
        env.actor(env.f.A);env.obj.adjudicate(env.case)
        env.actor(env.f.C);assert env.obj.finalize_case(env.case)==env.f.positive
        assert env.rec()['status']=='FINALIZED'
    finally:env.f.CLOCK[0]-=11


def test_first_challenger_cannot_monopolize_second_challenge(env):
    env.prepare(attested=True);env.obj.adjudicate(env.case)
    env.actor(env.f.A);env.obj.challenge(env.case,'Original assessment lacks issuer details')
    with pytest.raises(env.f.UserError,match='CHALLENGE_DUPLICATE'):
        env.obj.challenge(env.case,'Clog the single challenge slot')
    env.f.CLOCK[0]+=11
    try:
        with pytest.raises(env.f.UserError,match='CHALLENGE_RESPONSE_WINDOW_OPEN'):
            env.obj.adjudicate(env.case)
        env.actor(env.f.B)
        env.obj.challenge(env.case,'Counterparty response to issuer analysis')
        assert len(env.rec()['challenges'])==2
        env.actor(env.f.A)
        env.obj.adjudicate(env.case)
        assert env.rec()['round']==2
    finally:env.f.CLOCK[0]-=11


def test_global_128_case_capacity_griefing_removed_and_pages_bounded(env):
    env.actor(env.f.A)
    assert env.obj.case_exists(env.case) is False
    for i in range(130):
        args=list(env.args);args[0]=f'case-{i}'
        env.obj.create_case(*args)
    assert env.obj.case_exists('case-129') is True
    assert len(env.obj.get_case_ids_page(0,100)) == 100
    assert len(env.obj.get_case_ids_page(100,100)) == 30
    with pytest.raises(env.f.UserError,match='INVALID_PAGE'):
        env.obj.get_case_ids_page(0,101)

@pytest.mark.parametrize('recipient_form,attestor_form',[('string','string'),('wrapped','string'),('string','wrapped')])
def test_genvm_plain_string_addresses_supported(env,recipient_form,attestor_form):
    env.actor(env.f.A)
    raw=lambda addr,form:addr if form=='string' else env.f.Address(addr)
    args=list(env.args)
    args[1]=raw(env.f.B,recipient_form)
    args[-1]=raw(env.f.C,attestor_form)
    assert env.obj.create_case(*args)==env.case
    row=env.rec()
    assert row['recipient']==env.f.B.lower()
    assert row['attestor']==env.f.C.lower()
    assert row['status']=='DRAFT'
