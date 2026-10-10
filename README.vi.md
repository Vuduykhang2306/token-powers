# Token Powers

Dán địa chỉ một token ERC-20 trên Ethereum mainnet để xem chủ dự án còn làm
được gì với người đang giữ token: đóng băng ví, tăng thuế, chặn lệnh bán.

Trang chỉ đọc dữ liệu. Nó không bao giờ xin chữ ký và không tạo giao dịch nào.

[Bản chạy thật](https://vuduykhang2306.github.io/token-powers/) ·
[bài rà soát mà công cụ này xuất phát từ đó](https://github.com/Vuduykhang2306/smart-contract-security-lab/tree/main/reviews/2026-09_FatTokenV5)

## Vì sao làm cái này

Tôi từng rà soát một template token của launchpad, và nhiều token trên mainnet
được deploy từ template đó. Kết luận có ích nhất không nằm ở một finding cụ thể
nào:

> Mọi quyền nguy hiểm của template được quyết định ngay trong constructor, và
> không có hàm nào bật lại được. Người mua chỉ cần đọc năm giá trị on-chain là
> biết mình chịu rủi ro gì, và nó không đổi về sau.

Biết vậy thì có ích nhưng khó áp dụng, vì muốn đọc năm giá trị đó trên
Etherscan thì phải biết là năm cái nào. Trang này làm sẵn bước kiểm tra đó.

## Hai loại nguy hiểm khác nhau

Trong mấy contract này có hai loại nguy hiểm khác hẳn nhau, nhưng người ta hay
gộp làm một. Vì vậy câu "đã từ bỏ quyền sở hữu" hay bị hiểu thành "token này an
toàn".

Quyền của chủ sở hữu là những việc một địa chỉ đặc quyền có thể chọn làm về
sau: tăng thuế, đóng băng người giữ token, tắt giao dịch. Từ bỏ quyền sở hữu là
mất hết nhóm này, vĩnh viễn.

Cơ chế cài sẵn trong code thì tự chạy mỗi lần chuyển token, không cần ai gọi:
cửa sổ kill block gắn cờ người mua sớm, vòng airdrop làm các giao dịch nhỏ bị
revert. Từ bỏ quyền sở hữu không làm mất nhóm này. Ngược lại, nó khiến chúng
tồn tại vĩnh viễn, vì setter có thể tắt chúng giờ cũng không ai gọi được nữa.

Nên cùng một dòng `owner() = 0xdead` là tin tốt với nhóm thứ nhất nhưng là tin
xấu với nhóm thứ hai. Trang này chỉ rõ cái nào thuộc nhóm nào, chứ không đưa ra
một kết luận chung.

## Cách nó đọc một token

ABI trong [`lib/abi.ts`](lib/abi.ts) là một danh sách hàm để dò. Không token
nào có đủ chừng đó hàm. Trang gọi lần lượt từng hàm vào địa chỉ cần kiểm tra:
hàm nào trả lời là quyền token đó thật sự có, hàm nào revert là quyền nó không
có. `allowFailure` dùng cho việc này, ở đây revert cũng là một câu trả lời.

Tên các cờ lấy từ template nói trên, cộng thêm các kiểu đặt tên mà những họ
token khác dùng cho cùng một thứ (`isReward`, `isBlacklisted`, `_blackList`,
`isBlackListed`).

## Mô phỏng lệnh bán

Đọc cờ chỉ cho biết token có những quyền gì. Nó không cho biết lúc này bán có
được hay không, vì thứ chặn lệnh bán có thể không nằm ở cờ nào cả.

Nên [`lib/simulate.ts`](lib/simulate.ts) hỏi thẳng blockchain bằng `eth_call`
kèm state override: gán cho ví một số dư mà nó không có, thử chuyển token và
xem EVM có revert không. Không ký gì, không gửi gì lên mạng, và số dư giả chỉ
tồn tại trong đúng lần gọi đó.

Muốn biết ghi số dư giả vào đâu thì phải dò: với từng ô trong 32 ô nhớ đầu
tiên, tính `keccak256(địa chỉ . số ô)`, ghi đè, rồi đọc lại `balanceOf`. Ô nào
trả về đúng con số giả thì đó là mapping số dư.

Cách này giống mấy PoC chạy trên fork trong repo audit của tôi, chỉ là không
dùng Foundry. Ở đó harness gọi `deal()`, ở đây RPC làm việc đó.

## Những gì nó không biết được

- Nó dò theo tên hàm. Token nào giấu cùng một quyền dưới một cái tên không có
  trong danh sách thì sẽ trông như sạch. Kết quả xanh chỉ là một dữ kiện để cân
  nhắc, không thay được một bài audit.
- Lệnh bán được mô phỏng ở tầng token, tức là chuyển thẳng sang pair, đúng như
  việc `transferFrom` của router cuối cùng làm. Nó cho biết lệnh chuyển được
  phép, chứ không cho biết giao dịch đó có lời hay không.
- Dò ô nhớ sẽ thất bại với một số token: proxy, struct đóng gói, bố cục bộ nhớ
  lạ. Những trường hợp đó trả về "không xác định được", chứ không báo an toàn
  sai.
- Nó không đọc mã nguồn. Quyền sở hữu nằm sau multisig hay timelock nhìn ở đây
  giống hệt quyền sở hữu nằm trong khoá riêng của một người.

## Chạy thử

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # xuất tĩnh ra out/
```

`npm run verify` chạy phần logic đọc trong `lib/` thẳng trên mainnet, không cần
trình duyệt, với ba token đã biết trước hành vi:

```
=== BabyGOAT ===      22/32 hàm trả lời, đã từ bỏ quyền sở hữu, có isReward,
                      vòng airdrop bật vĩnh viễn, mô phỏng bán: bán được
=== USDC ===           3/32 hàm trả lời, chủ sở hữu còn sống, có blacklist, pause được
=== SHIB ===           0/32 hàm trả lời, không tìm thấy mặt quản trị nào
```

Phần phân tích nhận dữ liệu đọc được và trả ra kết luận, nên có thể kiểm tra
bằng các token đã biết, không chỉ nhìn bằng mắt trên giao diện.

## Công nghệ

Next.js (App Router, xuất tĩnh), TypeScript, wagmi, viem, TanStack Query,
Tailwind. Phần ví chỉ dùng injected connector. WalletConnect cần project id,
tức là phải để một khoá trong trang tĩnh, mà trang này không có lý do gì để
xin.

English: [README.md](README.md)

## Giấy phép

MIT.
