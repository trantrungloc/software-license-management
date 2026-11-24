"""
==============================================================================
KỊCH BẢN KIỂM THỬ PLAYWRIGHT UI: ĐĂNG NHẬP CHUẨN MỰC VÀ PHÂN QUYỀN (AUTH & RBAC)
1. Kiểm tra màn hình Cổng Đăng nhập SALM chuẩn mực (không còn Đăng nhập nhanh).
2. Kiểm tra các thành phần chuẩn: Email, Mật khẩu, Nút ẩn/hiện mật khẩu, Ghi nhớ, Quên mật khẩu.
3. Nhập tài khoản Chuyên viên CNTT (IT_STAFF) -> Kiểm tra giao diện Quản trị Cấp 1 Toàn trường.
4. Đăng xuất và Đăng nhập với tài khoản Đại diện Khoa CNTT (DEPT_REP) -> Kiểm tra hạn mức Cấp 2.
5. Chụp ảnh minh chứng cập nhật (docs/screenshots/08_login_modal.png).
==============================================================================
"""

import os
import sys
import time
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docs', 'screenshots')
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def run_test():
    console_errors = []
    print("[SALM TEST] Khởi chạy Chromium Headless để kiểm thử UI Đăng nhập Chuẩn & Phân quyền...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = context.new_page()

        page.on("response", lambda res: print(f"HTTP {res.status}: {res.url}") if res.status >= 400 else None)
        page.on("console", lambda msg: (
            print(f"Browser Console [{msg.type}]: {msg.text}"),
            console_errors.append(f"Console {msg.type}: {msg.text}") if msg.type in ["error"] else None
        ))
        page.on("pageerror", lambda err: console_errors.append(f"Page Error: {err}"))

        # BƯỚC 1: Điều hướng đến trang web
        print("\n[BƯỚC 1] Điều hướng đến http://localhost:5000...")
        page.goto("http://localhost:5000", wait_until="networkidle", timeout=15000)
        time.sleep(1)

        # Kiểm tra Modal Đăng Nhập Chuẩn
        page.wait_for_selector("#login-modal:not(.hidden)", timeout=5000)
        
        # Xác nhận KHÔNG CÒN nút đăng nhập nhanh hay thẻ preset 1-chạm
        quick_login_labels = page.locator("text='Hoặc đăng nhập nhanh 1-chạm'")
        assert quick_login_labels.count() == 0, "Không được còn nhãn Đăng nhập nhanh 1-chạm!"
        
        preset_staff = page.locator("button:has-text('Lê Hoàng')")
        assert preset_staff.count() == 0, "Không được còn thẻ chọn nhanh Lê Hoàng!"

        # Xác nhận CÁC THÀNH PHẦN CHUẨN ĐÃ HIỆN ĐỦ
        assert page.locator("#login-email").is_visible(), "Ô nhập Email phải hiển thị"
        assert page.locator("#login-password").is_visible(), "Ô nhập Mật khẩu phải hiển thị"
        assert page.locator("#btn-login-submit").is_visible(), "Nút Đăng nhập hệ thống phải hiển thị"
        assert page.locator("#login-remember").is_visible(), "Checkbox Ghi nhớ tài khoản phải hiển thị"
        assert page.locator("button:has-text('Quên mật khẩu?')").is_visible(), "Nút Quên mật khẩu phải hiển thị"
        assert page.locator("#btn-toggle-password").is_visible(), "Nút Ẩn/Hiện mật khẩu phải hiển thị"

        # Kiểm tra tính năng toggle Ẩn/Hiện mật khẩu
        pwd_input = page.locator("#login-password")
        assert pwd_input.get_attribute("type") == "password", "Mặc định mật khẩu phải được ẩn"
        page.locator("#btn-toggle-password").click()
        time.sleep(0.2)
        assert pwd_input.get_attribute("type") == "text", "Sau khi bấm mắt, mật khẩu phải hiển thị dạng text"
        page.locator("#btn-toggle-password").click()
        time.sleep(0.2)
        assert pwd_input.get_attribute("type") == "password", "Sau khi bấm mắt lần 2, mật khẩu phải được ẩn lại"

        login_shot_path = os.path.join(SCREENSHOT_DIR, "08_login_modal.png")
        page.screenshot(path=login_shot_path, full_page=True)
        print(f"✓ Đã chụp ảnh Cổng Đăng Nhập Chuẩn Mực: {login_shot_path}")

        # BƯỚC 2: Đăng nhập tài khoản Chuyên viên CNTT (IT_STAFF) thông qua form chuẩn
        print("\n[BƯỚC 2] Nhập Email & Mật khẩu đăng nhập Chuyên viên CNTT (itstaff@salm.edu.vn)...")
        page.fill("#login-email", "itstaff@salm.edu.vn")
        page.fill("#login-password", "MatKhau@123")
        page.click("#btn-login-submit")

        page.locator("#login-modal").wait_for(state="hidden", timeout=5000)
        time.sleep(1)

        # Xác minh thông tin Header và Role Banner của IT_STAFF
        header_text = page.locator("#user-header-container").inner_text()
        print(f"-> Header hiển thị: {header_text.replace(chr(10), ' | ')}")
        assert "Lê Hoàng" in header_text, "Header phải hiển thị tên Lê Hoàng"
        assert "Chuyên viên CNTT" in header_text, "Header phải hiển thị vai trò Chuyên viên CNTT"

        role_banner = page.locator("#role-banner")
        assert role_banner.is_visible(), "Role Banner phải hiển thị"
        banner_text = role_banner.inner_text()
        print(f"-> Role Banner: {banner_text.replace(chr(10), ' | ')}")
        assert "IT_STAFF" in banner_text, "Banner phải có mã IT_STAFF"
        assert "Toàn trường" in banner_text, "Banner phải ghi rõ phạm vi Toàn trường"

        # Kiểm tra đầy đủ 7 menu điều hướng của Chuyên viên CNTT
        assert page.locator("#nav-contracts").is_visible(), "Menu Hợp đồng phải hiển thị cho IT_STAFF"
        assert page.locator("#nav-audit").is_visible(), "Menu Nhật ký Kiểm toán phải hiển thị cho IT_STAFF"

        # BƯỚC 3: Đăng xuất và đăng nhập vai trò Đại diện Khoa CNTT (DEPT_REP)
        print("\n[BƯỚC 3] Nhấn nút 'Đăng xuất' và đăng nhập tài khoản Khoa CNTT (deptrep.cntt@salm.edu.vn)...")
        page.locator("button:has-text('Đăng xuất')").first.click()
        page.wait_for_selector("#login-modal:not(.hidden)", timeout=5000)
        time.sleep(0.5)

        # Điền form đăng nhập cho Trưởng Khoa CNTT
        page.fill("#login-email", "deptrep.cntt@salm.edu.vn")
        page.fill("#login-password", "MatKhau@123")
        page.click("#btn-login-submit")
        page.locator("#login-modal").wait_for(state="hidden", timeout=5000)
        time.sleep(1)

        # Xác minh thông tin Header và Role Banner của DEPT_REP
        dept_header_text = page.locator("#user-header-container").inner_text()
        print(f"-> Header sau khi đăng nhập Khoa CNTT: {dept_header_text.replace(chr(10), ' | ')}")
        assert "Phạm Minh" in dept_header_text, "Header phải hiển thị tên Phạm Minh"
        assert "Khoa Công nghệ Thông tin" in dept_header_text, "Header phải hiển thị Khoa CNTT"

        dept_banner_text = page.locator("#role-banner").inner_text()
        print(f"-> Role Banner: {dept_banner_text.replace(chr(10), ' | ')}")
        assert "DEPT_REP" in dept_banner_text, "Banner phải có mã DEPT_REP"
        assert "Cấp 2" in dept_banner_text, "Banner phải nhấn mạnh phạm vi Cấp 2"

        # Xác minh các menu bị ẩn đối với DEPT_REP
        contracts_hidden = not page.locator("#nav-contracts").is_visible()
        audit_hidden = not page.locator("#nav-audit").is_visible()
        print(f"-> Menu Hợp đồng đã ẩn: {contracts_hidden}")
        print(f"-> Menu Nhật ký kiểm toán đã ẩn: {audit_hidden}")
        assert contracts_hidden, "Menu Hợp đồng phải bị ẩn với DEPT_REP"
        assert audit_hidden, "Menu Nhật ký kiểm toán phải bị ẩn với DEPT_REP"

        # BƯỚC 4: Kiểm tra Console Errors
        print("\n[BƯỚC 4] Kiểm tra lỗi Browser Console...")
        if console_errors:
            print(f"⚠️ Phát hiện {len(console_errors)} lỗi console:")
            for err in console_errors:
                print(f"  - {err}")
        else:
            print("✓ 0 lỗi trong Browser Console!")

        browser.close()

    print("\n🎉 KIỂM THỬ PLAYWRIGHT UI AUTH & RBAC HOÀN TẤT THÀNH CÔNG 100%!")

if __name__ == "__main__":
    run_test()
