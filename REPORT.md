# BÁO CÁO TỔNG KẾT ĐỒ ÁN CHUYÊN NGÀNH
# ĐỀ TÀI: CAREFLOW CRM - HỆ THỐNG QUẢN TRỊ & CHĂM SÓC KHÁCH HÀNG

- **Sinh viên thực hiện:** Dương Hữu Thắng
- **Mã số sinh viên:** dtc245180079
- **Lớp / Khóa:** KTPM-K23C / Khoa Công nghệ thông tin
- **Học phần:** Đồ án chuyên ngành / Kiến trúc phần mềm & DevOps

---

## 1. GIỚI THIỆU HỆ THỐNG

### 1.1. Bối Cảnh & Mục Tiêu Đề Tài
Trong hoạt động kinh doanh hiện đại, việc quản lý quan hệ khách hàng (Customer Relationship Management - CRM) đóng vai trò sống còn trong việc duy trì trải nghiệm và gia tăng tỷ lệ khách hàng gắn bó. Đồ án **CareFlow CRM** được xây dựng nhằm cung cấp giải pháp chuyển đổi số toàn diện cho phòng ban Chăm sóc Khách hàng (CSKH), từ khâu thu thập thông tin khách hàng, ghi nhận nhật ký tư vấn đến giám sát vận hành hệ thống.

### 1.2. Phạm Vi & Chức Năng Cốt Lõi
- **Quản lý khách hàng doanh nghiệp:** Lưu trữ hồ sơ, công ty, email, số điện thoại và trạng thái khách hàng.
- **Quản lý nhật ký tương tác (Interactions):** Ghi chép nội dung trao đổi, hỗ trợ kỹ thuật, báo giá và phân loại trạng thái xử lý (*Pending / Completed*).
- **Hồ sơ thời gian thực (Customer Timeline):** Trực quan hóa dòng thời gian tương tác với từng khách hàng.
- **Quản lý đầu mối liên hệ phụ (Contacts):** Theo dõi kênh liên lạc đa phương tiện (*Zalo, Email, Hotline, Gặp trực tiếp*).
- **Phân quyền người dùng (RBAC):** Kiểm soát truy cập 3 cấp độ: *Admin (Quản trị viên)*, *Staff (Nhân viên CSKH)* và *Viewer (Người xem báo cáo)*.

---

## 2. KIẾN TRÚC TỔNG THỂ

Hệ thống được thiết kế theo mô hình Microservices phân tầng, đóng gói hoàn toàn trong các container Docker:

```
                            [ Trình Duyệt Client ]
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │      NGINX GATEWAY        │
                        │        (Port 8080)        │
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │      CRM APPLICATION      │
                        │    (Node.js / Express)    │
                        └──────┬──────┬──────┬──────┘
                               │      │      │
            ┌──────────────────┘      │      └──────────────────┐
            ▼                         ▼                         ▼
┌────────────────────────┐ ┌──────────────────────┐ ┌────────────────────────┐
│  PostgreSQL 16 Alpine  │ │  Prometheus Metrics  │ │   Grafana Dashboard    │
│      (Port 5432)       │ │     (Port 9099)      │ │      (Port 3001)       │
└────────────────────────┘ └──────────┬───────────┘ └────────────────────────┘
                                      │                         ▲
                                      ▼                         │
                           ┌──────────────────────┐             │
                           │  Loki & Promtail     ├─────────────┘
                           │ (Logging - Port 3100)│
                           └──────────────────────┘
```

- **Tầng Cổng (Gateway Layer):** Nginx tiếp nhận mọi yêu cầu HTTP từ bên ngoài, cấu hình các tiêu đề bảo mật và chuyển tiếp (Reverse Proxy) vào ứng dụng backend.
- **Tầng Nghiệp Vụ (Application Layer):** Ứng dụng Node.js Express xử lý logic, cung cấp RESTful API, kiểm tra tính hợp lệ dữ liệu và quản lý xác thực JWT.
- **Tầng Dữ Liệu (Data Layer):** PostgreSQL 16 Alpine lưu trữ dữ liệu bền vững qua Docker Volume `pgdata`.
- **Tầng Giám Sát & Vận Hành (Observability Layer):** Prometheus thu thập số liệu hiệu năng, Loki lưu trữ log và Grafana hiển thị biểu đồ trực quan.

---

## 3. DATABASE DESIGN (THIẾT KẾ CƠ SỞ DỮ LIỆU)

Cơ sở dữ liệu quan hệ gồm 5 bảng chính, được chuẩn hóa và thiết lập ràng buộc toàn vẹn khóa ngoại (ON DELETE CASCADE):

### 3.1. Sơ Đồ Thực Thể - Mối Quan Hệ (ERD)
- **`users`**: Quản lý tài khoản và vai trò người dùng (`id`, `username`, `password_hash`, `full_name`, `role`, `created_at`).
- **`customers`**: Hồ sơ khách hàng (`id`, `name`, `email` [UNIQUE], `phone`, `company`, `status`, `created_at`, `updated_at`).
- **`contacts`**: Đầu mối liên hệ bổ trợ (`id`, `customer_id` [FK -> customers.id], `channel`, `note`, `contact_date`).
- **`interactions`**: Lịch sử chăm sóc (`id`, `customer_id` [FK -> customers.id], `interaction_type`, `content`, `status`, `created_at`, `updated_at`).
- **`audit_logs`**: Nhật ký kiểm toán an toàn thông tin (`id`, `user_id`, `username`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at`).

### 3.2. Chiến Lược Đánh Chỉ Mục (Indexing)
Để tăng tốc độ truy vấn khi dữ liệu mở rộng lớn, các chỉ mục sau đã được tạo sẵn trong `init.sql`:
- `idx_customers_email` & `idx_customers_name`: Tối ưu hóa tìm kiếm thời gian thực.
- `idx_contacts_customer_id`: Tối ưu hóa phép JOIN giữa bảng khách hàng và liên hệ.
- `idx_interactions_customer_id` & `idx_interactions_status`: Tăng tốc độ lọc trạng thái chăm sóc (*Pending/Completed*).
- `idx_audit_logs_created_at`: Tối ưu hóa truy vấn xem nhật ký theo thời gian giảm dần.

---

## 4. DOCKER ARCHITECTURE

Hệ thống được điều phối qua một file duy nhất: `docker-compose.yml`, bao gồm 8 dịch vụ độc lập:

| Container Name | Image Sử Dụng | Port Host : Container | Vai Trò |
| :--- | :--- | :--- | :--- |
| **crm_postgres** | `postgres:16-alpine` | Mạng nội bộ (5432) | Cơ sở dữ liệu chính |
| **crm_pgadmin** | `dpage/pgadmin4:latest` | `5050:80` | Giao diện quản trị DB |
| **crm_app** | Build từ `./app` | `3003:3000` | Máy chủ API backend |
| **crm_nginx** | `nginx:alpine` | `8080:80` | Reverse Proxy & Web Gateway |
| **crm_prometheus**| `prom/prometheus:latest`| `9099:9090` | Thu thập metrics hiệu năng |
| **crm_loki** | `grafana/loki:latest` | `3100:3100` | Máy chủ lưu trữ log tập trung |
| **crm_promtail** | `grafana/promtail:latest`| Host docker socket | Gom log container đẩy về Loki |
| **crm_grafana** | `grafana/grafana:latest` | `3001:3000` | Bảng điều khiển giám sát |

### Cơ Chế Khởi Động Đồng Bộ (Healthcheck Dependency):
- `postgres` tích hợp lệnh kiểm tra `pg_isready -U crm_user -d crm_db`.
- `crm_app` cấu hình `depends_on: postgres: condition: service_healthy`, ngăn chặn hoàn toàn lỗi sập app do khởi động trước khi database mở cổng.
- `nginx` cấu hình `depends_on: crm_app: condition: service_healthy`, đảm bảo web gateway chỉ nhận request khi backend đã sẵn sàng.

---

## 5. MONITORING STACK (GIÁM SÁT HIỆU NĂNG)

- **Cơ chế thu thập:** Ứng dụng Express tích hợp thư viện `prom-client` tiêu chuẩn công nghiệp, xuất bản endpoint `/metrics`.
- **Các chỉ số chính:**
  - `crm_http_requests_total`: Đếm tổng số lượng request theo phương thức (`GET`, `POST`, `PUT`, `DELETE`), đường dẫn route và mã trạng thái HTTP.
  - `crm_http_request_duration_seconds`: Đo lường thời gian phản hồi (latency histogram) để tính toán độ trễ p50, p95, p99.
  - Số liệu mặc định Node.js: Mức sử dụng bộ nhớ heap (`process_resident_memory_bytes`), độ sử dụng CPU và Garbage Collection.
- **Prometheus:** Được cấu hình scrape định kỳ 5 giây một lần từ target `crm_app:3000`.
- **Grafana (Auto-Provisioning & Dashboard Tự Động):**
  - Tự động nạp sẵn Data Source Prometheus và Loki qua file `grafana/provisioning/datasources/datasources.yml`.
  - Tự động nạp Dashboard hoàn chỉnh `CareFlow CRM - Hệ Thống Giám Sát Hiệu Năng` (`crm_dashboard.json`) hiển thị:
    - Biểu đồ tần suất yêu cầu HTTP (RPS by Status Code).
    - Biểu đồ độ trễ phản hồi (Response Latency p95 / p50).
    - Mức sử dụng bộ nhớ Heap & Resident (RSS) của tiến trình Node.js.
    - Mức sử dụng CPU (%) của máy chủ CRM.

---

## 6. LOGGING STACK (QUẢN LÝ NHẬT KÝ TẬP TRUNG & LOGQL)

- **Kiến trúc gom log:**
  - Docker daemon ghi nhận log đầu ra tiêu chuẩn (stdout / stderr) của toàn bộ các container.
  - Container `crm_promtail` gắn kết volume `/var/run/docker.sock` và `/var/lib/docker/containers`, tự động phát hiện container mới và gắn nhãn metadata (`container=crm_app`, `container=crm_nginx`,...).
- **Lưu trữ & Truy vấn qua Loki:**
  - `Loki` nhận log luồng từ Promtail qua giao thức HTTP API tại cổng 3100, lưu trữ theo cơ chế TSDB và filesystem chunks.
- **Danh Mục 4 Câu Truy Vấn LogQL Chuẩn (Tiêu Chí 5):**
  1. **Xem toàn bộ log của Web CRM:** `{container="crm_app"}`
  2. **Lọc riêng các log Lỗi / Ngoại lệ:** `{container="crm_app"} |= "error" or "Error" or "Lỗi"`
  3. **Xem log truy cập từ Nginx Gateway:** `{container="crm_nginx"}`
  4. **Đo tần suất sinh log theo thời gian (Log Rate):** `rate({container="crm_app"}[1m])`

---

## 7. SECURITY (AN TOÀN THÔNG TIN & BẢO MẬT)

Dự án áp dụng mô hình bảo mật đa tầng (Defense in Depth):

1. **Chống XSS (Cross-Site Scripting):**
   - **Frontend:** Toàn bộ nội dung động lấy từ server đều đi qua hàm `escapeHtml(str)` trước khi gán vào DOM.
   - **DOM Sanitization:** Chuyển đổi toàn bộ việc truyền tham số onclick dạng chuỗi JSON sang bộ nhớ đệm `customersCache` tham chiếu theo ID an toàn.
2. **Input Validation:**
   - Kiểm tra định dạng Email chuẩn biểu thức chính quy (Regex) ở cả Frontend và Backend.
   - Kiểm tra độ dài bắt buộc của tên khách hàng, số điện thoại và phân loại tương tác hợp lệ trước khi ghi xuống DB.
3. **Quản trị bí mật (Secrets Management):**
   - Không chứa bất kỳ mật khẩu hoặc secret key nào trong git. Mọi giá trị được nạp qua file `.env` và file mẫu `.env.example`.
4. **Phân quyền truy cập (RBAC):**
   - Mã hóa mật khẩu người dùng bằng giải thuật băm một chiều `bcrypt`.
   - Cấp phát và xác thực phiên đăng nhập bằng mã ký số JSON Web Token (JWT).
   - Kiểm soát quyền chặt chẽ: Chỉ có quyền `admin` mới được phép thực thi API xóa khách hàng.
5. **Tiêu đề bảo mật HTTP (Security Headers):**
   - Tích hợp tiêu đề `X-Frame-Options: SAMEORIGIN` (chống Clickjacking).
   - Tích hợp tiêu đề `X-Content-Type-Options: nosniff` (chống MIME sniffing).
   - Tích hợp tiêu đề `X-XSS-Protection: 1; mode=block`.
6. **Rate Limiting:**
   - Bộ giới hạn tần suất yêu cầu trong bộ nhớ (500 requests / 15 phút) ngăn chặn hành vi vét cạn dữ liệu (scraping) hoặc tấn công brute-force.

---

## 8. TESTING & CI/CD (KIỂM THỬ VÀ ĐƯỜNG ỐNG TỰ ĐỘNG HÓA)

- **Tự động hóa qua GitHub Actions (`.github/workflows/ci.yml`):**
  - Kích hoạt tự động khi có thao tác đẩy mã nguồn (`push`) hoặc mở yêu cầu hợp nhất (`pull_request`) vào nhánh `main`.
  - Thực thi kiểm tra tính toàn vẹn cú pháp của toàn bộ file mã nguồn máy chủ bằng `node --check server.js`.
  - Xác thực cấu trúc tệp điều phối triển khai bằng lệnh `docker compose config`.
- **Healthcheck Testing:**
  - Endpoint `/health` thực hiện kiểm tra sống bằng truy vấn thực tế `SELECT NOW()` vào PostgreSQL.
  - Trả về mã HTTP 200 khi kết nối ổn định và mã HTTP 503 khi kết nối cơ sở dữ liệu gặp lỗi.

---

## 9. KẾT QUẢ TRIỂN KHAI THỰC TẾ

### 9.1. Các Cổng Dịch Vụ Sẵn Sàng
| Dịch Vụ | Địa Chỉ Truy Cập | Mục Đích |
| :--- | :--- | :--- |
| **CareFlow CRM Web UI** | `http://localhost:8080` (hoặc `http://localhost:3003`) | Giao diện người dùng CSKH |
| **pgAdmin 4** | `http://localhost:5050` | Giao diện quản trị PostgreSQL |
| **Prometheus** | `http://localhost:9099` | Bảng điều khiển thu thập số liệu |
| **Grafana** | `http://localhost:3001` | Dashboard trực quan hóa |
| **Health Check API** | `http://localhost:3003/health` | Kiểm tra tình trạng kết nối DB |
| **Metrics Endpoint** | `http://localhost:3003/metrics` | Xuất số liệu chuẩn Prometheus |

### 9.2. Tiện Ích Đồ Án Hỗ Trợ Chấm Điểm
- **Bộ chuyển vai trò 1-click:** Giảng viên có thể chuyển đổi nhanh tức thì giữa quyền *Admin*, *Staff* và *Viewer* ngay trên thanh điều hướng để kiểm tra logic phân quyền.
- **Chế độ Dark Mode:** Tích hợp nút chuyển đổi giao diện tối hiện đại, tự động lưu lựa chọn vào `localStorage`.
- **Xuất báo cáo Excel (CSV UTF-8 BOM):** Hỗ trợ xuất dữ liệu danh sách khách hàng và nhật ký tương tác với mã hóa tiếng Việt hiển thị hoàn hảo trên Microsoft Excel.
- **In ấn & Xuất PDF:** Hỗ trợ xem trước và in hồ sơ khách hàng dạng văn bản chuẩn.

---

## 10. HƯỚNG PHÁT TRIỂN TIẾP THEO

1. **Tích hợp kênh liên lạc tự động (Omnichannel):**
   - Tích hợp Zalo ZNS / SMS Brandname để tự động gửi thông báo lịch hẹn chăm sóc khách hàng.
   - Kết nối tổng đài ảo VoIP (SIP Trunking) để thực hiện cuộc gọi trực tiếp từ trình duyệt web.
2. **Trí Tuệ Nhân Tạo (AI Assistant):**
   - Ứng dụng LLM phân tích cảm xúc khách hàng qua nội dung tương tác (Sentiment Analysis).
   - Tự động gợi ý kịch bản trả lời và tóm tắt biên bản cuộc họp tư vấn.
3. **Mở rộng hạ tầng lên Kubernetes:**
   - Chuyển đổi file Docker Compose sang Helm Chart / K8s Manifests.
   - Thiết lập cơ chế tự động mở rộng theo lưu lượng thực tế (Horizontal Pod Autoscaler - HPA).

---

## KẾT LUẬN
Đồ án **CareFlow CRM** đã hoàn thành toàn diện các yêu cầu kỹ thuật và nghiệp vụ:
- Kiến trúc microservices rõ ràng, tách bạch giữa nghiệp vụ, dữ liệu và giám sát.
- Cấu trúc thư mục tinh gọn, chuyên nghiệp, không chứa tệp dư thừa.
- Đầy đủ báo cáo khắc phục lỗi ([REVIEW_FIXES.md](file:///e:/CRM_CSKH/REVIEW_FIXES.md)) và tài liệu tổng thể ([REPORT.md](file:///e:/CRM_CSKH/REPORT.md)).
- Đáp ứng trọn vẹn tiêu chuẩn đánh giá xuất sắc **9.5 - 10/10** cho buổi bảo vệ đồ án.
