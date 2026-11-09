# Docuflow frontend

Giao diện Next.js cho admin, QA và CTV.

## Chạy ở máy cá nhân

1. Khởi động backend và database theo [hướng dẫn backend](../backend/README.md).
2. Chạy `npm ci` rồi `npm run dev`.
3. Mở `http://localhost:3000`.

Frontend gọi API qua đường dẫn `/api/*`; Next.js chuyển tiếp tới backend. Mặc định backend ở `http://localhost:4000`. Nếu backend ở nơi khác, đặt `BACKEND_URL` bằng origin của backend **trước khi build hoặc khởi động Next.js**, ví dụ `BACKEND_URL=https://api.docuflow.example.com`. Không thêm `/api` vào giá trị này.

## Kiểm tra và triển khai

- Kiểm tra mã bằng `npm run lint`; build production bằng `npm run build`; chạy bản build bằng `npm run start`.
- Khi triển khai, cấu hình `BACKEND_URL` trên máy chạy Next.js và `FRONTEND_URL` trên backend. Backend phải truy cập được từ máy chạy Next.js.
- Kiểm tra đăng nhập lần lượt với admin, QA, CTV; tạo lô, giao việc, nộp, duyệt, xem lịch sử và tải CSV đã duyệt.
- Lịch sử duyệt có tìm kiếm, lọc theo kết quả và phân trang 20 lượt; QA chỉ thấy các lượt của công việc mình quản lý.
- Báo cáo duyệt hiển thị kết quả theo lô, lượt duyệt gần đây và file được CTV báo lỗi. QA/admin có thể mở lại việc hoặc thay file để giao lại.

README này mô tả cách chạy và luồng demo. Dữ liệu thật và tài khoản demo cần được chuẩn bị riêng trong database; không lưu mật khẩu trong repository.
