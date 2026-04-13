# Smart Labs Analyzer - Qwen Build Day 2026

# Dự án phân tích xét nghiệm y khoa thông minh với trực quan hóa 3D

## 📁 Cấu trúc Thư mục

```
qwen_build_day/
├── backend/               # Node.js/Express server proxy cho Qwen API
│   ├── server.js         # Định nghĩa 3 endpoints: STS, sign-url, analyze
│   └── package.json
├── mobile/               # Flutter scaffold (chứa code Dart chuẩn)
│   ├── lib/
│   │   ├── main.dart
│   │   ├── screens/      # Member 3: giao diện chính (analysis_screen.dart)
│   │   ├── services/     # Backend API + OSS upload
│   │   ├── models/       # JSON data contract
│   │   └── widgets/      # 3D scene + stream log panel
│   └── pubspec.yaml
├── .env                  # Secrets (tạo từ .env.example)
├── .env.example          # Template biến môi trường
├── FLUTTER_SETUP.md      # Hướng dẫn setup Flutter project chính thức
├── CODING_GUIDELINES.md  # Quy tắc Git branching, Clean separation
├── team_delegation.md    # Phân công 4 member
└── README.md             # (File này) Kiến trúc hệ thống
```

## 🏗️ Backend Workflow

Server Express chạy 3 API endpoint:

### 1. GET /api/sts-token

- Mobile gọi để xin quyền tạm (15 phút)
- Server call Alibaba STS AssumeRole
- Trả về AccessKeyId, AccessKeySecret, SecurityToken

### 2. GET /api/sign-url?object_key=...&expires_in=600

- Tạo signed URL cho file private trên OSS
- TTL có thể cấu hình (mặc định 300 giây)
- Dùng khi cần lấy file mà không expose bucket

### 3. POST /api/analyze

- Mobile gửi URL file (ảnh/PDF trên OSS)
- Server forward tới Qwen3.6-Plus API (DashScope)
- Stream kết quả dưới dạng **SSE (Server-Sent Events)**
- Qwen trả JSON theo data contract chuẩn

### GET /health

- Health check endpoint (debug purpose)

## 📱 Mobile Flutter Flow

1. **AnalysisScreen** (main UI)
   - Pick file → Get STS token → Upload OSS → Stream analysis
   - Map kết quả lên BodyScenePanel để highlight organ

2. **BackendApi** (service)
   - fetchStsToken(): GET /api/sts-token
   - streamAnalysis(fileUrl): POST /api/analyze → SSE stream

3. **FileUploadService** (service)
   - uploadFileToOss(): Dùng STS token upload trực tiếp OSS
   - (Hiện tại mock; cần thêm ali_oss package để dùng thực)

4. **BodyScenePanel** (widget)
   - Vẽ silhouette cơ thể người 2D
   - Highlight organ tags theo kết quả (màu xanh/đỏ)
   - Placeholder cho flutter_scene khi có GLB asset

## 🔄 Data Contract: JSON Từ Qwen

```json
{
  "status": "success",
  "analysis_date": "2026-04-13",
  "results": [
    {
      "indicator_name": "Creatinine",
      "value": "1.8",
      "unit": "mg/dL",
      "reference_range": "0.7 - 1.2",
      "organ_id": "kidneys",
      "severity": "abnormal_high",
      "patient_advice": "Uống đủ nước, giảm đồ mặn..."
    }
  ]
}
```

**organ_id** có thể là: `kidneys`, `liver`, `heart`, `lungs`, `blood`, `other`
**severity** có thể là: `normal`, `abnormal_low`, `abnormal_high`, `critical`

## 🚀 Bắt đầu

### Backend

```bash
cd backend
npm install
# Cấu hình .env tại root hoặc backend/.env
npm start
# Server chạy trên http://localhost:9000
```

### Mobile

```bash
# Xem FLUTTER_SETUP.md để hướng dẫn chi tiết
flutter pub get
flutter run
```

### Test

```bash
bash test-backend.sh http://localhost:9000
```

## 📋 Checklist Hoàn Chỉnh (Member 1 + Member 3)

### Member 1: Backend & Cloud

- ✅ Node.js server với 3 API endpoint
- ✅ Robust env loading (check root → backend)
- ✅ SSE streaming cho analyze endpoint
- ✅ Error handling + health endpoint
- ⏳ Deploy lên Alibaba Function Compute (optional cho demo)
- ⏳ Setup Alibaba Cloud (OSS, STS, IAM)

### Member 3: Flutter

- ✅ Analysis screen + control panel
- ✅ Backend API client (STS, sign-url, stream)
- ✅ 3D scene panel (silhouette + organ highlighting)
- ✅ Mock file upload service
- ⏳ Real file picker (thêm file_picker package)
- ⏳ Real OSS upload (thêm ali_oss package)
- ⏳ Real 3D rendering (flutter_scene + human_body.glb)

## 🔗 Liên Kết Ngoài

- [Alibaba OSS Docs](https://help.aliyun.com/zh/oss)
- [DashScope API](https://dashscope.console.aliyun.com/)
- [Flutter Docs](https://flutter.dev/docs)
- [Qwen Model Cards](https://huggingface.co/Qwen)

## 📞 Troubleshooting

- Backend không start? Kiểm tra `.env` có đủ secret không (xem `.env.example`)
- Mobile app crash? Kiểm tra Flutter version `>=3.3.0`
- OSS upload fail? Xác nhận bucket là private và IAM policy cho phép

---

**Last updated**: 2026-04-13
**Member 1**: Cloud Architect (Backend + STS setup)
**Member 3**: 3D UI (Flutter + highlighting)
