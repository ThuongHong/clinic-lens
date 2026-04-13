# Quy Tắc Lập Trình (Coding Guidelines & Anti-Conflict Rules)

Với team 4 người làm việc ở tốc độ cao trong Hackathon, rủi ro sập dự án do **Git Merge Conflict** (xung đột mã nguồn) là rất cao. Cả team cần tuân thủ tuyệt đối các quy ước sinh tồn sau:

---

## 🌳 1. Quy tắc Git Branching (Không commit thẳng vào Main)
Tuyệt đối không ai được phép `git commit` trực tiếp vào nhánh `main`. Quy trình tiêu chuẩn:
- Nhánh `main`: Chỉ chứa code hoàn chỉnh để nộp cho ban giám khảo vòng cuối.
- Nhánh `dev`: Trục chính để ráp code giữa các thành viên.
- Nhạc của ai người nấy nhảy. Tạo nhánh riêng theo cấu trúc:
  - `feat/3d-engine` (Dành cho Member 3 - 3D UI)
  - `feat/cloud-upload` (Dành cho Member 4 - API Logic)
  - `feat/backend-proxy` (Dành cho Backend)
- Trước khi tạo Pull Request gộp vào `dev`, **BẮT BUỘC** phải báo lên group chat của team: *"Tôi chuẩn bị merge branch XYZ, có ai đang viết đè file main.dart không?"*.

---

## 🧱 2. Kiến trúc Clean Separation cho Flutter (Phòng chống xung đột giữa Member 3 & 4)

Vì Member 3 và Member 4 cùng làm trên 1 cục repo Flutter, việc dẫm chân lên nhau là 99% sẽ xảy ra nếu không chia rõ ranh giới thư mục.

*   **Member 3 (3D & UI) CHỈ ĐƯỢC PHÉP chạm vào:**
    *   `lib/views/` (Giao diện màn hình).
    *   `lib/widgets/` (Các nút bấm, module 3D).
    *   **Quy ước:** Bạn không được gọi API hay viết logic ở đây. Nếu cần làm nút bấm Upload, hãy tạo tham số callback function ảo. Ví dụ: `UploadButton(onPressed: () { print("Nhờ Member 4 viết logic nhé"); })`.

*   **Member 4 (Data & State) CHỈ ĐƯỢC PHÉP chạm vào:**
    *   `lib/services/` (Các lệnh gọi API OSS, gỡ token STS, SSE Stream).
    *   `lib/controllers/` hoặc State Manager (Provider, Riverpod, Bloc).
    *   **Quy ước:** Bạn chỉ quan tâm việc đẩy dữ liệu lên dịch vụ Cloud và hứng dữ liệu trả về từ State, không sửa giao diện của người số 3. Khi hứng được luồng chữ của Qwen, chỉ việc gán nó vào biến `QwenResponseText` trong Store.

*   **CHỖ GIAO THOA DUY NHẤT:** `lib/models/` (Cấu trúc dữ liệu JSON) và `lib/main.dart` (Load Router). 

---

## 🎭 3. Mock-Driven Development (Phát triển bằng Dữ Liệu Ảo)
Để Front-end và Back-end chạy song song được ngay từ Phút 01 mà không cần chờ đợi:
* Cả team thống nhất cấu trúc thư mục Data Contract JSON (Đã ghi trong `README.md`).
* **Member 3** cứ lấy nguyên cục JSON ảo đó, gán cứng (hardcode) vào biến app để lập trình 3D ngả màu từ Xanh sang Đỏ ngay lập tức.
* **Backend + AI Engineer** thoải mái test và tinh chỉnh Node.js + Prompts ở môi trường riêng. Mục tiêu tối hậu: Dù Qwen có chém bão nôm na thế nào, API vẫn phải ép nó convert về đúng cái JSON Contract đó để trả về App.

---

## 🔐 4. Quản lý API Keys
*   TẠO FILE `.env` ngay lập tức trên máy từng người.
*   Thêm dòng `.env` vào file `.gitignore`.
*   **TUYỆT ĐỐI KHÔNG COMMIT LÊN GITHUB CÁC MÃ SAU**: `DASHSCOPE_API_KEY`, `ALI_ACCESS_KEY`, `ALI_SECRET_KEY`. (Phạm luật này, bot của Github sẽ quét và khoá key hoặc bạn bị mất sạch tiền trong thẻ tín dụng).
*   Tạo một file `.env.example` chứa tên biến trống để các thành viên biết cần hỏi Trưởng nhóm lấy key gì.
