def test_submit_proposal(funded_round, grants, submit, direct_alice):
    proposal_id = submit(funded_round, direct_alice)

    assert proposal_id == "p00000001"
    data = grants.get_proposal(proposal_id)
    assert data["round_id"] == funded_round
    assert data["applicant"].lower() == direct_alice.as_hex.lower()
    assert data["status"] == "submitted"
    assert data["requested_atto"] == "100"
    assert data["evidence_urls"] == ["https://example.com/proposal"]

    round_data = grants.get_round(funded_round)
    assert round_data["proposal_count"] == 1
    assert len(grants.list_round_proposals(funded_round)) == 1


def test_one_proposal_per_applicant_per_round(funded_round, submit, direct_vm, direct_alice):
    submit(funded_round, direct_alice)
    with direct_vm.expect_revert("one proposal per applicant"):
        submit(funded_round, direct_alice)


def test_different_applicants_can_submit(funded_round, submit, direct_alice, direct_bob):
    first = submit(funded_round, direct_alice)
    second = submit(funded_round, direct_bob)
    assert first != second


def test_submission_after_deadline_is_rejected(funded_round, submit, direct_vm, direct_alice):
    direct_vm.warp("2027-01-01T00:00:00Z")
    with direct_vm.expect_revert("deadline has passed"):
        submit(funded_round, direct_alice)


def test_requested_amount_is_capped(funded_round, submit, direct_vm, direct_alice):
    with direct_vm.expect_revert("exceeds the round cap"):
        submit(funded_round, direct_alice, requested=501)


def test_requested_amount_must_be_positive(funded_round, submit, direct_vm, direct_alice):
    with direct_vm.expect_revert("requested amount must be positive"):
        submit(funded_round, direct_alice, requested=0)


def test_too_many_evidence_urls(funded_round, submit, direct_vm, direct_alice):
    urls = [f"https://example.com/{i}" for i in range(4)]
    with direct_vm.expect_revert("at most 3"):
        submit(funded_round, direct_alice, urls=urls)


def test_evidence_must_be_https(funded_round, submit, direct_vm, direct_alice):
    with direct_vm.expect_revert("must be https"):
        submit(funded_round, direct_alice, urls=["http://example.com/proposal"])


def test_localhost_is_rejected(funded_round, submit, direct_vm, direct_alice):
    with direct_vm.expect_revert("private hosts are not allowed"):
        submit(funded_round, direct_alice, urls=["https://localhost/proposal"])


def test_private_ip_is_rejected(funded_round, submit, direct_vm, direct_alice):
    with direct_vm.expect_revert("private hosts are not allowed"):
        submit(funded_round, direct_alice, urls=["https://192.168.1.10/proposal"])


def test_url_credentials_are_rejected(funded_round, submit, direct_vm, direct_alice):
    with direct_vm.expect_revert("must not contain credentials"):
        submit(funded_round, direct_alice, urls=["https://user:pass@example.com/proposal"])


def test_unknown_round_is_rejected(submit, direct_vm, direct_alice):
    with direct_vm.expect_revert("unknown round"):
        submit("r9999", direct_alice)


def test_closed_round_rejects_submissions(grants, funded_round, submit, direct_vm, direct_alice):
    grants.close_round(funded_round)
    with direct_vm.expect_revert("round is closed"):
        submit(funded_round, direct_alice)
