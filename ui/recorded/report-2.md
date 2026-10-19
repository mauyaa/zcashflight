## ZcashFlight · ZecShop

**All 5 leaks closed. No leaks detected in these tests.**

Run 2 · testnet · 19 Oct 2026, 00:58 UTC · fingerprint `9aa9 1e44` · 11 requests, 5 log lines, 4 kept off the network

Compared with run 1: **5 closed**, 0 still open, **0 new**.

- ~~Address and amount sent to analytics~~ closed
- ~~Memo sent to error monitoring~~ closed
- ~~Transaction ID written to a log~~ closed
- ~~Checkout activity revealed to a price API~~ closed
- ~~Payment sent to a transparent address~~ closed

**Tested:** checkout · refunds · errors · Outbound fetch and http(s) requests from the app process · Console output and logs/server.log · Wallet RPC sends (z_sendmany, sendtoaddress, sendmany)

**Not tested:** Browser and mobile clients · Network metadata such as IP address and request timing at the transport layer

<sub>ZcashFlight checks observable application behaviour in these tests. It does not decrypt transactions, deanonymise users, or certify that an app is private in all circumstances.</sub>