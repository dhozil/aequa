# Laporan integration test — Aequa Grants

Tanggal: 29 Oktober 2026
Jaringan: GenLayer StudioNet (`https://studio.genlayer.com/api`, chain id `61999`)

## Ringkasan

| Item | Hasil |
| --- | --- |
| Contract baru | `0x667F7F8fE63dc0283982962800e4636cF87c5703` |
| Deploy tx | `0x19c7f0809fb6451c36e9318a21c62d300d0b290d10bdd93f2f3efdfdfae3d27e` |
| Hasil deploy | `MAJORITY_AGREE` |
| `genvm-lint check` | Lolos (3 checks, 19 method: 8 view + 11 write) |
| Direct tests | 94/94 passed (2 test baru) |
| Integration suite | 5/5 passed, 12 menit 46 detik |
| Frontend write path (`genlayer-js`) | 9/9 write berhasil |
| Frontend pages | `/`, `/rounds`, `/rounds/r0001`, `/proposals/p00000001`, `/admin`, `/rounds/r0003/submit` render tanpa error console |
| Bug ditemukan & diperbaiki | `transfer_ownership` gagal saat dipanggil dari chain |
| Bug ditemukan & diperbaiki (kode) | `claim_refund` menandai refund sebelum transfer benar-benar terkirim — direkonsiliasi dua fase + hook bounce |

Wallet yang dipakai (dari `D:\Genlayer-project\wallet`, disinkronkan oleh `scripts/sync_wallet.py`):

- owner/deployer — `dev` (`0x3958A649b41cd7C8561F4233cC0F5b0469Bc98E0`)
- applicant — `recipient` (`0x0Eb9431eDdbF170d2224F4f9E47D4DD68b6c44bc`)
- outsider — `seller` (`0x99bF44395CaC814E671ADFF8b69d968Fac4e5Db3`), ditambahkan sebagai `OUTSIDER_*`

## Verifikasi ulang setelah perbaikan (compact run)

Deploy baru setelah refund dua fase + hook bounce:

| Item | Nilai |
| --- | --- |
| Contract | `0x2489Af08c51C8346F4362d3D1e4C6c63a6E1E5e6` |
| Deploy tx | `0x4ffbce8a8344300f837d57a5c668f6bcc6e8790fa3f1276686aaae0b65f01853` |
| Suite | `tests/integration/test_aequa_compact.py` (satu pass, ±22 tx) |
| Hasil | 1 passed (8m17s) |
| `genvm-lint` | Lolos (21 method: 8 view, 13 write) |
| Direct tests | 105/105 |

Yang terbukti di jaringan: create/fund/pause guard/submit/evaluate (approved 55)/disburse/confirm_payout
(`paid`, `delivered`)/close/guard round tertutup/claim_refund/confirm_refund/`transfer_ownership`
bolak-balik, plus penolakan `outsider disburse`, `outsider claim_refund`, submit & fund pada round
yang ditutup, serta fund & submit saat paused.

Leg refund pada run ini berhenti di status `sent`: child transfer tidak pernah dieksekusi maupun
dilaporkan gagal dalam ±2,5 menit, sehingga `confirm_refund` menolak memindahkan ledger
(`claimed_atto = 0`, `total_refunded_atto = 0`, `refund_in_flight = 1`) dan claim tetap bisa
di-recover setelah grace 1 jam. Itu perilaku yang benar — tapi `bounced_refunds` tetap 0, jadi
hook `__on_errored_message__` **belum terbukti terpanggil** oleh StudioNet untuk kasus ini.

## Cakupan method

Semua 19 method publik dipanggil terhadap contract hasil deploy, bukan mock.

| Method | Bukti / skenario |
| --- | --- |
| `create_round` | valid (rubric 5 kriteria/2 gate), plus ditolak untuk: outsider, weight ≠ 100, id kriteria duplikat, deadline lampau, `max_grant > budget`, saat paused |
| `fund_round` | owner 5 GEN + outsider 1 GEN (payable), ditolak untuk: nilai 0, round tak dikenal, round closed, saat paused |
| `submit_proposal` | applicant (2 GEN) dan outsider di round B, ditolak untuk: duplikat wallet/round, `http://`, `localhost`, 4 URL, melebihi cap, round closed, round tak dikenal, saat paused |
| `evaluate_proposal` | 2 evaluasi nyata (web fetch + LLM + consensus): approve 51/100, reject 20/100 (`gate_failed:peer_reviewed`); ditolak saat dievaluasi dua kali |
| `disburse` | applicant mengirim payout 2 GEN, ditolak untuk outsider dan saat masih ada payout in-flight |
| `confirm_payout` | permissionless (dipanggil outsider), idempoten; reservation berpindah `reserved → paid` hanya setelah balance terbukti turun |
| `recover_payout` | ditolak sebelum grace period 1 jam (path sukses butuh transfer gagal + 1 jam, lihat Limitasi) |
| `close_round` | owner menutup 3 round; outsider ditolak |
| `claim_refund` | pull-based pro-rata 2 funder, bisa saat paused, double claim ditolak, ditolak sebelum close / saat ada proposal belum dievaluasi |
| `set_paused` | toggle oleh owner; menolak funding/submit/create; payout & refund tetap jalan; outsider ditolak |
| `transfer_ownership` | owner → outsider → owner; owner lama langsung kehilangan akses |
| `get_stats`, `get_round`, `list_rounds`, `list_round_proposals`, `get_proposal`, `list_proposals`, `get_refund`, `list_round_funders` | dibaca di setiap tahap; bentuk JSON-nya di-assert persis sama dengan yang di-decode `frontend/lib/types.ts` |

## Temuan 1 — `transfer_ownership` gagal dari chain (diperbaiki)

Tx `0x24282e8c…109f` menerima `new_owner` sebagai **string**, sedangkan field storage `owner: Address`
butuh objek `Address`:

```
File "/contract.py", line 537, in transfer_ownership
    self.owner = new_owner
AttributeError: 'str' object has no attribute 'as_bytes'
```

Direct test lama lolos karena mengirim objek `Address`, bukan string seperti yang datang dari calldata.
Perbaikan di `contracts/aequa_grants.py`: normalisasi + konstruksi `Address(...)`, dengan penolakan
alamat malformed/zero. Dua direct test baru (`test_ownership_accepts_the_hex_string_the_runner_sends`,
`test_ownership_rejects_a_malformed_address`) mengunci perilaku ini; setelah redeploy, transfer
ownership lolos di StudioNet (tx `transfer_ownership -> outsider` dan sebaliknya).

## Temuan 2 — refund bisa "hilang" karena delivery tidak direkonsiliasi (diperbaiki di kode)

`claim_refund` menulis `claimed_refunds`, `refunded_atto`, dan `total_refunded` **sebelum** child
transfer selesai, lalu mengabaikan hasilnya:

```python
claimed_map[funder] = u256(claimed + claimable)
round_.refunded_atto += u256(claimable)
self.total_refunded += u256(claimable)
_Recipient(gl.message.sender_address).emit_transfer(value=u256(claimable))
```

Pada run ini dua child transfer berakhir `NO_MAJORITY`:

- refund 1 GEN milik `r0004` — child tx `0x49f3c7fc01c7364d0945d51234c41258e030dceb975c8a938a7d77765ca40191`
  (`status: undefined`, `result: NO_MAJORITY`, `value: 1000000000000000000`, penerima owner).
- refund 2 GEN milik `r0002` — gagal dengan pola yang sama.

Konsekuensinya: ledger menyatakan uang sudah kembali (`claimable_atto = 0`), tetapi nilai tetap ada di
contract dan tidak ada function yang bisa mengirim ulang atau membatalkannya. `genlayer appeal` pada
child tx di atas tidak mengubah hasil. Saldo contract `4.000000000000000001 GEN` padahal hanya
`1 GEN` (round `r0003` yang masih open) + 1 atto rounding dust yang seharusnya tersisa — jadi **3 GEN
tertahan**. Ini persis kelas kegagalan yang sudah diantisipasi alur payout (`payout_pending` →
`confirm_payout` → `recover_payout`), tetapi belum diterapkan pada refund.

Rekomendasi: refund dua fase seperti payout — simpan claim sebagai pending beserta snapshot balance,
`confirm_refund` memindahkan `refunded_atto` hanya jika balance terbukti turun, dan
`recover_refund` mengembalikan claim ke `owed` setelah grace period agar funder bisa retry.
Frontend `refund-claim.tsx` perlu dua state tambahan (`pending`, `owed`).

**Status perbaikan.** Refund dua fase (`claim_refund` → `confirm_refund` → `recover_refund`) sudah
terpasang di `contracts/aequa_grants.py`, beserta state `owed` dan statistik `bounced_refunds` di
frontend. Pengukuran lanjutan menunjukkan jendela settle 90 detik masih bisa tertipu: child transfer
yang berakhir `NO_MAJORITY` sempat mendebit saldo lebih dari 4 menit sebelum nilainya kembali.
Karena itu reconcile utama sekarang memakai hook GenVM `__on_errored_message__` (pola yang sama
dengan `contracts/sacramentum.py`): saat transfer gagal, nilainya kembali lewat `gl.message.value`
dan claim langsung dilepas — termasuk membalik kredit ledger kalau `confirm_refund` sudah
menyelesaikannya. Diuji di direct suite (105 test), belum diuji ulang on-chain.

## State on-chain setelah test

| Round | Isi | Status |
| --- | --- | --- |
| `r0001` | funding 6 GEN, proposal `p00000001` approved 51 → paid 2 GEN, refund pro-rata 3.999999999999999999 GEN | closed, available 0 |
| `r0002` | funding 2 GEN, proposal `p00000002` rejected 20, refund 2 GEN tercatat tetapi transfer gagal | closed, 2 GEN tertahan |
| `r0003` | dibuat via `genlayer-js`, funding 1 GEN, proposal `p00000003` submitted | open, available 1 GEN |
| `r0004` | dibuat via `genlayer-js`, funding 1 GEN, refund 1 GEN tercatat tetapi transfer gagal | closed, 1 GEN tertahan |
| `r0005` | dibuat via `scripts/aequa.py`, funding 1 GEN, refund 1 GEN terkirim normal | closed, available 0 |

`get_stats`: `total_funded 11 GEN`, `total_paid 2 GEN`, `total_refunded 7.999999999999999999 GEN`,
`balance 4.000000000000000001 GEN`, `payout_in_flight 0`.

## Frontend

Server dev Next.js 16 dijalankan dengan konfigurasi yang ada; `.env.local` diarahkan ke contract baru.
Halaman yang diperiksa beserta data yang tampil benar:

- `/` — alamat contract baru, treasury 11 GEN funded / 2 GEN paid / 5 round / 3 proposal, daftar round.
- `/rounds` — 5 round, filter open/closed, total funded dan paid.
- `/rounds/r0001` — treasury, status closed, paid 2 GEN, refunded 3.99 GEN, rubric + gate, proposal paid.
- `/proposals/p00000001` — skor 51, gate true, skor per kriteria + kutipan + fingerprint sumber, payout delivered.
- `/admin` — stats, daftar round, kontrol owner (butuh wallet), status ACTIVE.
- `/rounds/r0003/submit` — cap 1 GEN dan available 1 GEN terbaca dari chain.

Tidak ada error console; satu-satunya pesan adalah HMR/React DevTools.

Jalur **tulis** frontend diuji lewat `frontend/scripts/contract-smoke.mjs` memakai `genlayer-js`
yang sama dengan komponen UI dan payload yang identik: `create_round` (JSON rubric, bigint budget,
bigint min_score), `fund_round` (value bigint), `submit_proposal` (list URL + bigint), `set_paused`
(bool), `close_round`, `claim_refund`. Sembilan write berhasil dan state-nya diverifikasi lewat
`readContract`.

## Limitasi

- MetaMask tidak bisa dijalankan headless; jalur tulis diuji dengan `genlayer-js` + private key wallet,
  sedangkan halaman diuji read-only.
- `recover_payout` hanya diuji pada penolakan grace period. Path sukses butuh transfer payout yang
  gagal ditambah 1 jam, atau pemangkasan konstanta grace di network lokal.
- Semua test berjalan di StudioNet (gasless). Rate limit per IP (60 req/menit, 500 `gen_call`/jam)
  tidak tersentuh pada run ini, tetapi suite melakukan ±45 transaksi sehingga sebaiknya tidak
  dijalankan berulang dalam satu jam.
- Contract yang ada sekarang sudah terisi state test; untuk demo bersih, deploy ulang
  (`python scripts/deploy.py`) lalu perbarui `frontend/.env.local`.

## Artefak

- `tests/integration/test_aequa_full_surface.py` — suite utama (self-contained, bisa attach via `AEQUA_GRANTS_ADDRESS`)
- `frontend/scripts/contract-smoke.mjs` — smoke test jalur tulis frontend
- `integration-run.log`, `integration-run-05.log`, `frontend-dev.log` — log mentah run
