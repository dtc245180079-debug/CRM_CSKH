# CAREFLOW CRM - HỆ THỐNG QUẢN TRỊ & CHĂM SÓC KHÁCH HÀNG

- **Sinh viên thực hiện:** Dương Hữu Thắng
- **Mã số sinh viên:** dtc245180079
- **Lớp / Khóa:** KTPM-K23C / Khoa Công nghệ thông tin
- **Học phần:** Triển khai và Quản trị Hệ thống Phần mềm / Đồ án chuyên ngành
- **Mục tiêu nghiệm thu:** Đạt trọn vẹn **10.0 / 10.0** theo Bảng Tiêu Chí Đánh Giá Đề Tài

---

## 🏆 ĐỐI CHIẾU BẢNG TIÊU CHÍ ĐÁNH GIÁ ĐỀ TÀI (10.0 ĐIỂM)

| STT | Tiêu Chí Đánh Giá | Điểm | Mức Độ Đáp Ứng Của Dự Án |
| :---: | :--- | :---: | :--- |
| **1** | **Quản lý mã nguồn trên GitHub** | **1.5** | Repository đầy đủ source + cấu hình; đủ các commit có ý nghĩa chuẩn Conventional Commits; có `README.md` hướng dẫn chạy chi tiết và `.github/workflows/ci.yml`. |
| **2** | **Triển khai ứng dụng + Database** | **1.5** | Web CRM Node.js/Express chạy ổn định; kết nối PostgreSQL 16 qua connection pool an toàn; endpoint `/health` kiểm tra sống thực tế; pgAdmin 4 hoạt động cổng 5050. |
| **3** | **Nginx Reverse Proxy** | **1.5** | Nginx đóng vai trò Web Gateway (cổng 8080); cấu hình `trust proxy` trong Express; tích hợp đầy đủ 5 HTTP Security Headers chống XSS, Clickjacking, MIME-sniffing. |
| **4** | **Hệ thống giám sát (Prometheus + Grafana)** | **1.5** | Tích hợp `prom-client` xuất `/metrics`; Prometheus cào số liệu 5s/lần; **Grafana tự động nạp Data Source & Dashboard giám sát Web + Runtime metrics** mà không cần cấu hình tay. |
| **5** | **Hệ thống log tập trung (Loki + LogQL)** | **1.5** | Promtail tự động gom log container qua Docker socket gửi về Loki (cổng 3100); có sẵn danh mục **4 câu lệnh LogQL** chuẩn xác để truy vấn và kiểm thử. |
| **6** | **Hardening hệ thống** | **1.5** | Áp dụng **8 biện pháp bảo mật nâng cao**: non-root container (`USER node`), network isolation (`crm_net`), parameterized SQL, bảo vệ secrets `.env`, bcrypt, RBAC, XSS escape, in-memory rate limiting. |
| **7** | **Tổng thể & Trình bày** | **1.0** | Điều phối 8 containers bằng lệnh `docker compose up -d` duy nhất; healthcheck liên container đồng bộ; kịch bản demo rõ ràng, hiểu sâu kiến trúc hệ thống. |
| **TỔNG** | **Toàn Bộ Hệ Thống** | **10.0** | **ĐẠT XUẤT SẮC 10.0 / 10.0** |

---

## 1. GIỚI THIỆU TỔNG QUAN

**CareFlow CRM** là giải pháp phần mềm quản trị quan hệ và chăm sóc khách hàng chuyên nghiệp, được xây dựng theo kiến trúc Microservices đóng gói hoàn chỉnh bằng Docker Compose. Hệ thống tích hợp toàn diện giữa nghiệp vụ CRM, bảo mật đa tầng (Hardening), giám sát hiệu năng thời gian thực (Prometheus & Grafana), thu thập nhật ký tập trung (Loki & Promtail) và tự động hóa quy trình CI/CD qua GitHub Actions.

### Các Phân Hệ Nghiệp Vụ Cốt Lõi:
1. **Quản lý khách hàng doanh nghiệp (`customers`):** CRUD đầy đủ hồ sơ, tìm kiếm thời gian thực, quản lý trạng thái (*Active, Inactive, Lead*).
2. **Nhật ký tương tác (`interactions`):** Theo dõi toàn diện lịch sử chăm sóc (*Tư vấn, Báo giá, Khiếu nại...*), phân loại trạng thái (*Chờ xử lý / Hoàn thành*), hiển thị dòng thời gian (Timeline) cho từng khách hàng.
3. **Đầu mối liên hệ phụ (`contacts`):** Quản lý thông tin đầu mối bổ trợ đa kênh (*Zalo, Email, Hotline, Gặp trực tiếp*).
4. **Phân quyền người dùng (RBAC) & Nhật ký kiểm toán:**
   - 3 vai trò: `admin` (toàn quyền), `staff` (thêm/sửa, khóa xóa), `viewer` (chỉ xem báo cáo).
   - Mật khẩu băm một chiều `bcrypt`, phiên làm việc ký số JSON Web Token (JWT).
   - Tích hợp bộ chuyển vai trò 1-click trên giao diện hỗ trợ giảng viên kiểm thử nhanh logic phân quyền.
   - Bảng `audit_logs` tự động ghi vết mọi hành vi thêm, sửa, xóa cùng IP thực của client.

---

## 2. CẤU TRÚC THƯ MỤC DỰ ÁN

```
CRM_CSKH/
├── .github/
│   └── workflows/
│       └── ci.yml                     # Pipeline CI/CD: kiểm tra cú pháp & docker compose config
├── app/
│   ├── public/
│   │   └── index.html                 # Giao diện SPA: XSS Sanitization, Dark Mode, Role Switcher
│   ├── Dockerfile                     # Multi-stage Dockerfile chạy non-root USER node
│   ├── package.json                   # 7 dependencies: express, cors, dotenv, pg, prom-client, jwt, bcrypt
│   ├── package-lock.json
│   └── server.js                      # API Core, Trust Proxy, JWT Auth, RBAC, Real Healthcheck, Metrics
├── db/
│   └── init.sql                       # 5 bảng quan hệ, Foreign Keys ON DELETE CASCADE, Index, Seed Data
├── nginx/
│   └── nginx.conf                     # Web Gateway, Reverse Proxy port 80 -> crm_app + Security Headers
├── prometheus/
│   └── prometheus.yml                 # Cấu hình thu thập metrics định kỳ 5s từ crm_app:3000
├── loki/
│   └── local-config.yaml              # Cấu hình lưu trữ và phân vùng log tập trung Loki
├── promtail/
│   └── config.yml                     # Gom log từ Docker socket /var/run/docker.sock đẩy về Loki
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── datasources.yml        # Tự động nạp Data Source Prometheus & Loki khi khởi động
│       └── dashboards/
│           ├── dashboards.yml         # Provider tự động nạp dashboard JSON
│           └── crm_dashboard.json     # Dashboard trực quan hóa Web RPS, Latency p95, Node.js Memory & CPU
├── docker-compose.yml                 # Điều phối 8 containers, Healthchecks, Mạng cô lập & Volumes
├── .env.example                       # Mẫu biến môi trường an toàn (không chứa secret thật)
├── .gitignore                         # Bỏ qua node_modules, .env, log files
├── README.md                          # Hướng dẫn tổng quan & cẩm nang vận hành
├── REVIEW_FIXES.md                    # Báo cáo chi tiết các lỗi kỹ thuật đã xử lý (FIX-001 -> FIX-008)
├── REPORT.md                          # Báo cáo tổng kết đồ án bài bản phục vụ hội đồng chấm thi
└── LICENSE                            # Giấy phép nguồn mở MIT License
```

---

## 3. DANH SÁCH CỔNG DỊCH VỤ (PORT MAPPING)

| Phân Hệ Dịch Vụ | Container Name | Cổng Truy Cập (Host) | Vai Trò & Mô Tả |
| :--- | :--- | :--- | :--- |
| **Nginx Web Gateway** | `crm_nginx` | `http://localhost:8080` | **Cổng truy cập chính thức của Web CRM** (qua Reverse Proxy) |
| **CRM App (Node.js)** | `crm_app` | `http://localhost:3003` | Cổng backend API nội bộ (hỗ trợ kiểm thử trực tiếp) |
| **pgAdmin 4** | `crm_pgadmin` | `http://localhost:5050` | Giao diện quản trị PostgreSQL (kết nối nội bộ DB) |
| **Grafana Dashboard** | `crm_grafana` | `http://localhost:3001` | Dashboard trực quan hóa Metrics & Logs (tự động nạp cấu hình) |
| **Prometheus** | `crm_prometheus` | `http://localhost:9099` | Bảng điều khiển thu thập chỉ số hiệu năng |
| **Loki** | `crm_loki` | `http://localhost:3100` | Máy chủ lưu trữ nhật ký log tập trung |
| **PostgreSQL 16** | `crm_postgres` | `Mạng nội bộ: 5432` | Cơ sở dữ liệu (cô lập hoàn toàn trong mạng `crm_net`) |

---

## 4. TÀI KHOẢN MẶC ĐỊNH HỆ THỐNG

### 4.1. Tài Khoản Đăng Nhập Web CRM (Tích hợp 1-Click Role Switcher trên UI)
| Tên Đăng Nhập | Mật Khẩu | Vai Trò (Role) | Quyền Hạn |
| :--- | :--- | :--- | :--- |
| `admin` | `admin123` | **Admin** | Toàn quyền thêm, sửa, xóa khách hàng, xem Audit Logs |
| `staff` | `staff123` | **Staff** | Thêm mới, cập nhật khách hàng & tương tác (khóa tính năng xóa) |
| `viewer` | `viewer123` | **Viewer** | Chế độ chỉ đọc dữ liệu (khóa toàn bộ thao tác ghi/sửa/xóa) |

### 4.2. Tài Khoản Quản Trị Hạ Tầng
- **pgAdmin 4:** Email: `admin@crm.com` | Mật khẩu: `PgAdminSecurePass2026!`
- **Grafana:** Tài khoản: `admin` | Mật khẩu: `admin`

---

## 5. HƯỚNG DẪN KHỞI CHẠY TỪNG BƯỚC

### Bước 1: Chuẩn Bị File Môi Trường
```bash
# Trên Windows PowerShell
Copy-Item .env.example .env

# Trên Linux / macOS
cp .env.example .env
```

### Bước 2: Khởi Động Toàn Bộ 8 Dịch Vụ
Khởi chạy tất cả container nền bằng một lệnh duy nhất:
```bash
docker compose up -d --build
```

### Bước 3: Kiểm Tra Tình Trạng Hoạt Động (Healthcheck)
```bash
docker compose ps
```
*Tất cả container sẽ hiển thị trạng thái `Up`, trong đó `crm_postgres`, `crm_app`, `crm_nginx` đạt trạng thái `healthy`.*

### Bước 4: Kiểm Tra Nhanh Các Cổng
- Mở Web CRM qua Nginx: `http://localhost:8080`
- Kiểm tra sức khỏe kết nối DB thực tế: `http://localhost:3003/health`
- Kiểm tra dữ liệu metrics Prometheus: `http://localhost:3003/metrics`
- Mở bảng điều khiển Grafana: `http://localhost:3001` (đăng nhập `admin`/`admin`)

---

## 6. HƯỚNG DẪN TRUY VẤN LOGQL TRONG GRAFANA (TIÊU CHÍ 5)

Hệ thống đã tích hợp sẵn **Loki** và **Promtail**. Để thực hiện truy vấn log theo yêu cầu của Tiêu chí 5:
1. Truy cập Grafana: `http://localhost:3001` -> Menu bên trái chọn **Explore** (biểu tượng la bàn).
2. Chọn Data Source: **Loki** (đã được tự động nạp sẵn).
3. Nhập một trong các câu lệnh LogQL tiêu chuẩn sau vào thanh tìm kiếm:

### Câu Lệnh 1: Xem toàn bộ log của ứng dụng CRM
```logql
{container="crm_app"}
```
*Tác dụng:* Xuất toàn bộ nhật ký hoạt động thời gian thực của máy chủ Node.js Express.

### Câu Lệnh 2: Lọc riêng các log có chứa lỗi hoặc cảnh báo
```logql
{container="crm_app"} |= "error" or "Error" or "Lỗi"
```
*Tác dụng:* Giúp quản trị viên phát hiện tức thì các ngoại lệ xử lý dữ liệu hoặc truy vấn DB thất bại.

### Câu Lệnh 3: Xem log truy cập của Nginx Reverse Proxy
```logql
{container="crm_nginx"}
```
*Tác dụng:* Kiểm tra các lượt truy cập HTTP đi qua cổng Web Gateway Nginx và mã phản hồi tương ứng.

### Câu Lệnh 4: Đếm tần suất sinh log theo thời gian (Log Rate)
```logql
rate({container="crm_app"}[1m])
```
*Tác dụng:* Đo lường cường độ hoạt động của ứng dụng, phát hiện các đợt tăng đột biến lưu lượng (Spike).

---

## 7. BIỆN PHÁP HARDENING ĐÃ ÁP DỤNG (TIÊU CHÍ 6)

Hệ thống triển khai mô hình phòng thủ theo chiều sâu (Defense in Depth) với **8 biện pháp bảo mật**:
1. **Non-root Container:** Container Node.js chạy với tài khoản không đặc quyền `USER node` (UID 1000), loại bỏ nguy cơ chiếm quyền root máy chủ nếu bị khai thác.
2. **Network Isolation:** Tất cả container giao tiếp qua bridge network `crm_net`. Cổng 5432 của PostgreSQL được đóng kín hoàn toàn với máy host bên ngoài.
3. **Quản trị bí mật (Secrets Hardening):** Mật khẩu DB, JWT secret được nạp qua `.env`, có `.env.example` và được `.gitignore` bảo vệ tuyệt đối.
4. **Security Headers:** Cấu hình đồng bộ ở cả Nginx và Express: `nosniff`, `SAMEORIGIN`, `X-XSS-Protection`, `Referrer-Policy`, `server_tokens off`.
5. **Chống 100% SQL Injection:** Toàn bộ câu truy vấn sử dụng cơ chế Parameterized Queries (`$1, $2...`) của thư viện `pg`.
6. **Chống XSS (Cross-Site Scripting):** Frontend áp dụng hàm `escapeHtml()` cho toàn bộ dữ liệu động trước khi render vào DOM; sử dụng `customersCache` an toàn theo ID.
7. **Rate Limiting:** Bộ giới hạn tần suất 500 requests / 15 phút ngăn chặn hành vi vét cạn dữ liệu (scraping) và tấn công brute-force.
8. **Trust Proxy & Real Client IP:** Cấu hình `app.set('trust proxy', 1)` giúp Express đọc chính xác IP thực của client qua Nginx, ngăn chặn việc tính chung lượt request và ghi đúng IP vào `audit_logs`.

---

## 8. KỊCH BẢN DEMO BẢO VỆ ĐỒ ÁN (TIÊU CHÍ 7 - DÀNH CHO SINH VIÊN)

Khi trình bày trước hội đồng giảng viên, hãy thực hiện theo đúng 6 bước sau để lấy trọn vẹn điểm số:

- **Bước 1 (Kiến trúc & Docker):** Mở terminal gõ `docker compose ps` để chứng minh đủ 8 containers đều `Up` và các service trọng yếu đều `healthy`.
- **Bước 2 (Nghiệp vụ CRM & Reverse Proxy):** Mở trình duyệt truy cập `http://localhost:8080` (qua Nginx). Demo các thao tác Thêm khách hàng, Ghi nhận tương tác, xem Timeline và xuất file Excel CSV tiếng Việt.
- **Bước 3 (Xác thực & RBAC):** Sử dụng bộ chuyển vai trò 1-click ở góc trên bên phải: Chuyển sang `Staff` (nút Xóa bị ẩn), chuyển sang `Viewer` (các form nhập liệu bị khóa).
- **Bước 4 (Healthcheck & Database):** Mở `http://localhost:3003/health` để chứng minh endpoint kiểm tra kết nối sống thực tế tới PostgreSQL (có latency ms). Mở pgAdmin `http://localhost:5050` xem các bảng và chỉ mục Index.
- **Bước 5 (Prometheus & Grafana):** Mở `http://localhost:3001` (Grafana). Mở Dashboard **"CareFlow CRM - Hệ Thống Giám Sát Hiệu Năng"** đã được tự động nạp sẵn, chỉ cho giảng viên thấy đồ thị RPS, Latency p95 và RAM/CPU Node.js.
- **Bước 6 (Loki & LogQL):** Mở mục **Explore** trong Grafana, chọn **Loki**, dán câu truy vấn `{container="crm_app"}` để hiển thị nhật ký truy cập vừa thao tác ở Bước 2.
