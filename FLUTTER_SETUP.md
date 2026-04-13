# Quick Start: Flutter Setup

Vì `flutter` CLI không có sẵn trên máy này, hãy làm theo các bước sau trên máy development của bạn:

## Bước 1: Cài Flutter SDK

```bash
# macOS (với Homebrew)
brew install flutter

# Ubuntu/Linux
sudo snap install flutter --classic

# Hoặc download từ https://flutter.dev/docs/get-started/install
```

## Bước 2: Tạo Flutter Project Mới

```bash
cd ~/path/to/qwen_build_day
flutter create --project-name smart_labs_analyzer mobile_app
cd mobile_app
```

## Bước 3: Copy Scaffold vào Project Mới

```bash
# Copy tất cả files từ mobile/lib/* vào mobile_app/lib/
cp -r ../mobile/lib/* lib/

# Copy pubspec.yaml
cp ../mobile/pubspec.yaml .
```

## Bước 4: Tải Dependencies

```bash
flutter pub get
```

## Bước 5: Thêm File Picker Plugin

```bash
flutter pub add file_picker
```

## Bước 6: Chạy App

```bash
flutter run
```

Hoặc trên thiết bị iOS:

```bash
flutter run -d iphone
```

Hoặc trên thiết bị Android:

```bash
flutter run -d android
```

## Troubleshooting

- **"flutter: command not found"**: Flutter SDK chưa được add vào PATH. Xem hướng dẫn cài đặt Flutter chính thức.
- **"Error: Gradle version X is too new"**: Cập nhật Android Gradle Plugin trong `android/build.gradle`.
- **"CocoaPods error"**: Trên macOS, chạy `flutter clean && flutter pub get`.

## Next: Integration với Alibaba Cloud

Sau khi app chạy được, cấu hình các credential:

1. **Backend URL**: Mở `lib/screens/analysis_screen.dart` và update:

   ```dart
   _backendApi = BackendApi(baseUrl: 'http://your-backend-url:9000');
   _uploadService = FileUploadService(baseUrl: 'http://your-backend-url:9000');
   ```

2. **3D Model**: Tải file `human_body.glb` từ Sketchfab hoặc Turbosquid, rồi:
   - Đặt vào `assets/3d/human_body.glb`
   - Update `pubspec.yaml`:

     ```yaml
     flutter:
       uses-material-design: true
       assets:
         - assets/3d/human_body.glb
     ```

3. **Add flutter_scene** (khi sẵn sàng):

   ```bash
   flutter pub add flutter_scene
   ```

   Rồi import và dùng trong `lib/widgets/body_scene_panel.dart`.
