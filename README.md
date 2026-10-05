# HỆ THỐNG CRM CHĂM SÓC KHÁCH HÀNG (CRM_CSKH)
- **Sinh viên thực hiện:** Dương Hữu Thắng
- **Mã số sinh viên:** dtc245180079
- **Lớp / Khóa:** KTPM-K23C / Khoa Công nghệ thông tin 

## 1. Kiến trúc tổng quan
Hệ thống được đóng gói hoàn toàn bằng Docker Compose gồm các phân hệ:
- **Web App & DB:** Node.js Web Server, PostgreSQL 16, pgAdmin 4.
- **Reverse Proxy:** Nginx (bổ sung Security Headers).
- **Monitoring:** Prometheus thu thập chỉ số, Grafana trực quan hóa.
- **Logging:** Promtail thu thập log container đẩy về Loki, phân tích qua LogQL.

## 2. Danh sách cổng dịch vụ (Port Mapping)
| Dịch vụ | Cổng truy cập | Ghi chú |
| :--- | :--- | :--- |
| Nginx (Web chính) | `8080` | Điểm truy cập duy nhất vào Web CRM |
| pgAdmin | `5050` | Giao diện quản trị PostgreSQL |
| Grafana | `3001` | Dashboard giám sát Metrics & Logs |
| Prometheus | `9099` | Kiểm tra trạng thái Scrape Targets |
| Web App (Node.js) | `3003` | Cổng ứng dụng nội bộ |
| PostgreSQL | `5432` | Mạng nội bộ `crm_net` (được cô lập) |

## 3. Hướng dẫn khởi chạy
1. Sao chép biến môi trường mẫu:
   ```bash
   cp .env.example .env
   ```

2. Khởi chạy toàn bộ hệ thống bằng một lệnh duy nhất:
   ```bash
   docker compose up -d --build
   ```
3. Dừng hệ thống:
   ```bash
   docker compose down
   ```
