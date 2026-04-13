# Smart Labs Analyzer (Qwen AI Build Day 2026)

Dự án phát triển nền tảng phân tích kết quả xét nghiệm y khoa thông minh, trực quan hóa trên mô hình cơ thể người 3D, được thiết kế đặc biệt cho giải đấu **Qwen AI Build Day 2026**.

Dự án tận dụng sức mạnh đa phương thức của mô hình **Qwen3.6-Plus** kết hợp vùng không gian điện toán toàn diện của hệ sinh thái **Alibaba Cloud** để đem lại trải nghiệm mượt mà, bảo mật và chính xác cho bệnh nhân/người dùng đầu cuối.

---

## 🏗️ 1. Kiến Trúc Hệ Thống (System Architecture)

```mermaid
sequenceDiagram
    participant User as Mobile App (Flutter)
    participant FC as Alibaba Function Compute
    participant OSS as Alibaba Cloud OSS
    participant Qwen as Qwen3.6-Plus (Model Studio)

    User->>FC: Bước 1: Yêu cầu quyền Upload
    FC-->>User: Cấp STS Token (Tạm thời)
    User->>OSS: Bước 2: Direct Upload (PDF/Ảnh) bảo mật qua STS
    OSS-->>User: Upload thành công
    User->>FC: Bước 3: Kích hoạt phân tích (Trích xuất & Tư vấn)
    FC->>Qwen: Gửi Prompt + URL ảnh/PDF
    
    rect rgb(200, 220, 240)
    Note over FC,Qwen: SSE Streaming Xử lý Đa phương thức
    Qwen-->>FC: Streaming Text & Bóc tách JSON
    FC-->>User: Streaming Server-Sent Events (SSE)
    end
    
    Note over User: Bước 4: Ứng dụng vẽ dữ liệu lên 3D theo Real-time
```

---

## 🛠️ 2. Tech Stack (Công nghệ cốt lõi)

### AI Brain & Platform
* **LLM Core:** `Qwen3.6-Plus` (Alibaba Model Studio) - Xử lý đa phương thức, tự động đọc ảnh/PDF bảng biểu xét nghiệm và đưa ra lời khuyên mà không cần OCR trung gian. Chạy trên context 1M token.
* **Storage:** `Alibaba Cloud OSS` - Lưu trữ file người dùng bảo mật, hỗ trợ private URL và Direct Upload.
* **Backend logic:** `Alibaba Function Compute` (Serverless Node.js/Python) - Đóng vai trò làm Proxy kết nối AI và cấp quyền, tối ưu chi phí (chỉ tính tiền khi chạy hàm).

### Client App
* **Frontend Framework:** `Flutter` (iOS / Android)
* **3D Visualization:** Sử dụng package `flutter_scene` (Engine Impeller) để render mô hình người dạng `.glb` trực tiếp với hiệu năng > 90fps. Không sử dụng WebView giúp tăng tốc độ tải và tiết kiệm RAM thiết bị. 

---

## 🔄 3. Dữ Liệu Đầu Ra Chuẩn Hóa (Data Contract)

Để mô hình 3D biết vùng nào trên cơ thể cần phản hồi (highlight), Qwen3.6-Plus được thiết lập hệ thống Prompting khắt khe nhằm đảm bảo đầu ra luôn là chuẩn **JSON Array**.

**Ví dụ một JSON Output trả về từ Qwen khi phân tích file Gan & Thận:**

```json
{
  "status": "success",
  "patient_name": "Nguyen Van A",
  "analysis_date": "2026-04-13",
  "results": [
    {
      "indicator_name": "Creatinine",
      "value": "1.8",
      "unit": "mg/dL",
      "reference_range": "0.7 - 1.2",
      "organ_id": "kidneys",
      "severity": "abnormal_high",
      "patient_advice": "Chỉ số Creatinine của bạn đang cao hơn mức bình thường, cho thấy chức năng lọc của thận có thể đang bị quá tải. Bạn nên uống nhiều nước lọc hơn, giảm ăn thịt đỏ và đi khám chuyên khoa thận nội tiết sơm."
    },
    {
      "indicator_name": "AST (SGOT)",
      "value": "25",
      "unit": "U/L",
      "reference_range": "< 40",
      "organ_id": "liver",
      "severity": "normal",
      "patient_advice": "Men gan ở mức an toàn. Hãy tiếp tục duy trì chế độ sinh hoạt và ăn uống lành mạnh hiện tại."
    }
  ]
}
```
*(App Flutter sẽ map `organ_id = "kidneys"` với object Thận trên `flutter_scene` và đổi màu dựa theo `severity` = `abnormal_high` thành màu Đỏ cảnh báo).*

---

## 🔒 4. Tiêu Điểm Kỹ Thuật Cho Hackathon (Hackathon Edge)

Để gây ấn tượng với ban giám khảo, hệ thống đã giải quyết 3 bài toán lớn của ngành Y tế Điện tử:

1. **🏥 Privacy & Security Compliance:** Không đưa đường dẫn file Public. Áp dụng quy trình cấp phát **STS (Security Token Service)** để ứng dụng di động đẩy file thẳng lên bucket Private trên OSS. Máy chủ chỉ giải mã khi cần thiết.
2. **⚡ Real-time Latency (Trải nghiệm liền mạch):** Không bắt người dùng nhìn màn hình "Loading" 15 giây. Kết hợp thiết kế **SSE (Server-Sent Events) Streaming**, Qwen sẽ đẩy từng chữ giải thích về điện thoại theo thời gian thực như đang chat, làm hiệu ứng giao diện mượt mà và cảm giác "AI đang sống".
3. **🇻🇳 Hyper-Localization (Địa phương hóa trọn vẹn):** Khai thác năng lực đa ngôn ngữ thế hệ mới của Qwen. Hệ thống có khả năng đọc các tờ xét nghiệm ghi song ngữ hoặc tiếng Việt gõ tắt (phổ biến tại VN), đồng thời output lời khuyên bằng văn phong cực kỳ tự nhiên, phù hợp với thói quen ăn uống của người Việt.

---

## 🚀 5. Lộ Trình Phát Triển (Next Steps)

- [ ] Khởi tạo dự án Flutter, cấu hình `flutter_scene` cơ bản và import file `human_body.glb`.
- [ ] Thiết lập tài khoản Alibaba Cloud: Tạo OSS Bucket, setup IAM Policy & Role cho STS Token.
- [ ] Code Serverless bằng Function Compute (API lấy STS và API Call Qwen Studio).
- [ ] Tối ưu System Prompting (Thử nghiệm Few-shot Prompt) cho mô hình Qwen3.6-Plus.
- [ ] Tích hợp Luồng giao diện toàn vẹn (Upload -> Streaming Response -> Highlight 3D).
