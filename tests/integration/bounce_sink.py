# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""Test-only recipient that cannot receive a plain value transfer.

`scripts/bounce_drill.py` deploys this contract and makes it submit a proposal,
so a payout to it has no matching method to land in. That is how the drill forces
a real child-transfer bounce on StudioNet instead of simulating one.

The pinned runner does not accept `__receive__` (genvm-lint rejects it), so the
sink deliberately has no payable method at all.
"""

from genlayer import *


class BounceSink(gl.Contract):
    def __init__(self):
        pass

    @gl.public.view
    def ping(self) -> str:
        return "bounce-sink"

    @gl.public.write
    def apply(
        self,
        aequa: str,
        round_id: str,
        title: str,
        summary: str,
        urls: list,
        amount: u256,
    ) -> None:
        """Submit a proposal to Aequa with this contract as the applicant."""
        target = gl.get_contract_at(Address(aequa))
        target.emit(on="finalized").submit_proposal(
            round_id, title, summary, urls, amount
        )
