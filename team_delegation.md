# Bảng Phân Công Nhiệm Vụ (Team 4 Người) - Qwen Build Day

Để tận dụng tối đa thời gian có hạn của buổi Hackathon, team 4 người cần chia việc để làm song song (Parallel Work) thay vì đợi nhau. Dưới đây là lộ trình chia vai (Roles) tối ưu nhất:

### 👨‍💻 Member 1: Cloud Architect & Backend (Trưởng nhóm Hạ tầng)
*Người này sẽ chịu trách nhiệm toàn bộ các dịch vụ trên màn hình Alibaba Cloud Console.*
- **Task 1:** Đăng ký tài khoản Alibaba Cloud, mở dịch vụ **Model Studio** và lấy danh sách `DASHSCOPE_API_KEY`.
- **Task 2:** Tạo **OSS Bucket (Private)**. Cấu hình CORS.
- **Task 3:** Setup **RAM (IAM)** để xin quyền trực tiếp `sts:AssumeRole`. Cung cấp khoá bảo mật chéo cho Backend.
- **Task 4:** Deploy đoạn code Node.js (`server.js` tôi vừa viết) lên **Alibaba Function Compute**. Cung cấp địa chỉ URL API cuối cùng cho team Mobile.

### 🧠 Member 2: AI Engineer (Chuyên gia Tiền xử lý & Prompt)
*Không lo về code app, người này chỉ làm việc với Data và Qwen API.*
- **Task 1:** Săn lùng bộ Data test: 5-10 tờ kết quả xét nghiệm mẫu (Viết bằng Tiếng Việt hoặc Song Ngữ).
- **Task 2:** Thử nghiệm API trực tiếp qua Postman hoặc trên giao diện thử nghiệm của DashScope.
- **Task 3:** Viết **Few-shot Prompt** cực xịn cho Qwen3.6-Plus. Ép mô hình luôn phải trả về chuẩn mã JSON.
- **Task 4:** Bắt các lỗ hổng của Qwen (Ví dụ: Đưa file ảnh mờ, đưa file PDF không phải y khoa) xem mô hình phản ứng sao và chỉnh lại Prompt.

### 🎨 Member 3: 3D Visualization & UI (Chuyên gia Frontend Giao diện)
*Người tập trung cao độ vào trải nghiệm thị giác (Wow-factor).*
- **Task 1:** Lên Sketchfab săn lùng một file mô hình cơ thể người 3D (`human_anatomy.glb`) xịn xò nhất. Nếu dính background xấu thì dùng Blender gỡ ra.
- **Task 2:** Thiết lập môi trường `flutter_scene` trong app Flutter. 
- **Task 3:** Load thành công mô hình 3D lên điện thoại. 
- **Task 4:** Viết một hàm Dart: Nhận đầu vào là biến JSON `{organ: "kidneys", severity: "high"}` thì tự động đổi màu mô hình 3D vùng Thận sang Đỏ rực. (Code tạm dữ liệu giả chưa cần AI).

### ⚙️ Member 4: Mobile Logic & Integration (Chuyên gia Frontend Luồng xử lý)
*Nhân vật kết nối toàn bộ các mảnh ghép lại với nhau.*
- **Task 1:** Code màn hình Camera và Trình chọn file (File Picker) cho người dùng quét tờ xét nghiệm.
- **Task 2:** Viết API gọi lên Backend Node.js để xin `STS Token`.
- **Task 3:** Dùng token đó viết hàm ném thẳng bức ảnh vừa chụp lên hệ thống **Alibaba OSS**.
- **Task 4:** Lấy đường link OSS đó, gọi vào Webhook của Backend. Bắt luồng phản hồi **SSE Streaming**. Update từng chữ cái mà AI phân tích lên màn hình điện thoại (Giống hiệu ứng ChatGPT gõ chữ).

---

### 🕒 Workflow Tích Hợp (Integration Point)
- Khi thời gian Hackathon trôi qua 2/3, **Member 3 (3D)** và **Member 4 (Logic)** tiến hành gộp code Flutter lại (Merge nhánh). 
- Toàn team tập hợp để test quét file thật và tinh chỉnh độ trễ.
