# Token Powers

Dán địa chỉ một token ERC-20 trên Ethereum mainnet, xem chủ dự án còn làm được
gì với người đang giữ token đó: đóng băng ví, nâng thuế, tắt lệnh bán.

Chỉ đọc. Trang này không bao giờ xin chữ ký và không dựng giao dịch nào.

**[Bản chạy](https://vuduykhang2306.github.io/token-powers/)** ·
[bài rà soát sinh ra nó](https://github.com/Vuduykhang2306/smart-contract-security-lab/tree/main/reviews/2026-09_FatTokenV5)

## Vì sao có nó

Tôi rà soát một template token của launchpad mà nhiều token trên mainnet được
deploy từ đó. Kết luận đáng giữ lại không phải là một finding cụ thể nào:

> Mọi quyền lực nguy hiểm của template được chốt trong constructor, và không hàm
> nào bật lại được. Người mua chỉ cần đọc năm biến bool on-chain là biết mình
> chịu rủi ro gì, vĩnh viễn.

Đó là một sự thật hữu ích mà không ai dùng được, vì "đọc năm biến bool trên
Etherscan" đòi hỏi phải biết là năm biến nào. Đây chính là phép kiểm tra đó,
dựng thành một trang web.

## Cái phân biệt mà toàn bộ công cụ dựa vào

Trong mấy contract này có hai loại nguy hiểm khác hẳn nhau, và người ta gộp làm
một. Đó là lý do câu "đã từ bỏ quyền sở hữu" bị đọc thành "token này an toàn".

**Quyền của chủ sở hữu** là thứ một địa chỉ đặc quyền có thể chọn làm sau: nâng
thuế, đóng băng người giữ, tắt giao dịch. Từ bỏ quyền sở hữu là giết sạch nhóm
này, vĩnh viễn.

**Cơ chế chốt sẵn trong code** thì tự chạy, trên từng lần chuyển, không cần ai
gọi gì: cửa sổ kill block gắn cờ người mua sớm, vòng airdrop làm revert các giao
dịch nhỏ. Từ bỏ quyền sở hữu **không** giết nhóm này. Nó làm nhóm này thành vĩnh
viễn, vì cái setter lẽ ra tắt được thì giờ cũng không ai với tới.

Nên cùng một dòng `owner() = 0xdead` là tin tốt với nhóm thứ nhất và tin xấu với
nhóm thứ hai. Trang này nói rõ cái nào là cái nào, thay vì in ra một kết luận
chung.

## Cách nó đọc một token

ABI trong [`lib/abi.ts`](lib/abi.ts) là một bộ dò, không phải một interface thật.
Không token nào cài đủ ngần đó hàm. Gọi hết vào địa chỉ cần kiểm: hàm nào trả
lời là quyền token đó thật sự có, hàm nào revert là quyền token đó không có.
`allowFailure` chính là cơ chế — ở đây revert là câu trả lời, không phải lỗi.

Tên các cờ lấy từ template nói trên, cộng thêm các quy ước đặt tên mà những họ
token khác dùng cho cùng một thứ (`isReward`, `isBlacklisted`, `_blackList`,
`isBlackListed`).

## Phần mô phỏng lệnh bán

Đọc cờ cho biết token có những quyền gì. Nó không cho biết **lúc này bán có
trôi không**, vì chỗ chặn có thể nằm ở nơi mà không cờ nào nhắc tới.

Nên [`lib/simulate.ts`](lib/simulate.ts) hỏi thẳng blockchain, bằng `eth_call`
kèm state override: gán cho ví một số dư nó không thật sự có, rồi thử lệnh
chuyển và xem EVM có revert không. Không ký gì, không phát tán gì, và cái số dư
giả kia chỉ tồn tại bên trong đúng lời gọi đó.

Tìm chỗ ghi số dư giả là dò thử: với từng ô trong 32 ô nhớ đầu, tính
`keccak256(địa chỉ . số ô)`, ghi đè, rồi đọc lại `balanceOf`. Ô nào trả về đúng
con số giả thì đó là mapping số dư.

Đây đúng là thứ mà mấy PoC chạy trên fork trong repo audit của tôi làm, chỉ
khác là không có Foundry — ở đó harness gọi `deal()`, ở đây RPC làm việc đó.

## Những gì nó không nói được

- **Nó dò theo tên hàm.** Token nào giấu cùng một quyền sau một cái tên không có
  trong danh sách thì sẽ hiện ra sạch sẽ. Kết quả xanh ở đây là một dữ kiện để
  quyết định, không phải một bài audit.
- **Lệnh bán được mô phỏng ở tầng token**, dưới dạng chuyển thẳng sang pair,
  đúng thứ mà `transferFrom` của router rốt cuộc làm. Nó chứng minh lệnh chuyển
  được phép, không chứng minh giao dịch đó có lời.
- **Dò ô nhớ thất bại với một số token** — proxy, struct đóng gói, bố cục lạ.
  Những ca đó trả về "không xác định được", chứ không trả về một lời trấn an sai.
- **Nó không đọc mã nguồn.** Quyền sở hữu nằm sau multisig hay timelock nhìn ở
  đây giống hệt quyền sở hữu nằm trong khoá riêng của một người.

## Chạy thử

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # xuất tĩnh ra out/
```

`npm run verify` chạy logic đọc trong `lib/` thẳng lên mainnet, không cần trình
duyệt, trên ba token đã biết trước hành vi:

```
=== BabyGOAT ===      22/32 hàm trả lời, đã từ bỏ quyền sở hữu, có isReward,
                      vòng airdrop bật vĩnh viễn, mô phỏng bán: bán được
=== USDC ===           3/32 hàm trả lời, chủ sở hữu còn sống, có blacklist, pause được
=== SHIB ===           0/32 hàm trả lời, không tìm thấy mặt quản trị nào
```

Phần phân tích nhận dữ liệu đọc được vào và trả kết luận ra, nên kiểm tra được
bằng các token đã biết chứ không chỉ nhìn bằng mắt trên giao diện.

## Công nghệ

Next.js (App Router, xuất tĩnh), TypeScript, wagmi, viem, TanStack Query,
Tailwind. Phần ví chỉ dùng injected connector: WalletConnect cần project id,
tức là phải nhét một khoá vào trang tĩnh, mà trang này không có lý do gì để xin.

English: [README.md](README.md)

## Giấy phép

MIT.
