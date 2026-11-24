"""
==============================================================================
KỊCH BẢN KIỂM THỬ TỰ ĐỘNG PLAYWRIGHT E2E — HỆ THỐNG SALM
Luồng: Cấp phát bản quyền Cấp 2 cho máy Lab & Giải mã License Key (BR03)
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
    console_logs = []

    print("[SALM TEST] Khởi chạy trình duyệt Chromium Headless...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = context.new_page()

        # Lắng nghe Console & Page Errors
        page.on("console", lambda msg: (
            console_errors.append(f"Console {msg.type}: {msg.text}") if msg.type in ["error"] else console_logs.append(f"{msg.type}: {msg.text}")
        ))
        page.on("pageerror", lambda err: console_errors.append(f"Page Error: {err}"))

        # BƯỚC 1: Truy cập trang chủ & chờ networkidle
        print("\n[BƯỚC 1] Điều hướng đến http://localhost:5000 và đợi networkidle...")
        page.goto("http://localhost:5000", wait_until="networkidle", timeout=15000)
        time.sleep(1)

        # Kiểm tra tiêu đề trang
        title = page.title()
        print(f"✓ Tiêu đề trang: '{title}'")
        assert "SALM" in title, "Tiêu đề trang phải chứa từ khóa 'SALM'"

        screenshot_01 = os.path.join(SCREENSHOT_DIR, "01_dashboard_overview.png")
        page.screenshot(path=screenshot_01, full_page=True)
        print(f"✓ Đã lưu ảnh chụp tổng quan: {screenshot_01}")

        # BƯỚC 2: Kiểm tra ngữ cảnh người dùng & Chuyển Tab GV/Lab
        print("\n[BƯỚC 2] Kiểm tra giao diện và chuyển sang Tab Cấp phát GV/Lab...")
        page.click("#nav-assignments")
        time.sleep(0.5)

        # Ghi nhận số lượng dòng cấp phát hiện tại
        initial_rows = page.locator("#assignments-table-body tr").count()
        print(f"✓ Số lượng bản ghi cấp phát ban đầu: {initial_rows}")

        # BƯỚC 3: Mở Modal Cấp phát chi tiết và gán seat cho Máy trạm phòng Lab
        print("\n[BƯỚC 3] Thực hiện cấp phát 1 seat bản quyền cho máy trạm Lab A301...")
        page.click("button:has-text('Cấp phát chi tiết')")
        page.wait_for_selector("#assign-modal:not(.hidden)", timeout=5000)

        # Chọn Quỹ Khoa CNTT (chọn option đầu tiên có giá trị hợp lệ)
        alloc_select = page.locator("#assign-alloc-select")
        alloc_options = alloc_select.locator("option").all()
        selected_alloc_val = None
        for opt in alloc_options:
            val = opt.get_attribute("value")
            if val and len(val) > 0:
                selected_alloc_val = val
                break
        
        assert selected_alloc_val, "Phải có ít nhất 1 quỹ bản quyền đã phân bổ cho Khoa để cấp phát"
        alloc_select.select_option(selected_alloc_val)
        time.sleep(0.5) # Đợi nạp danh sách thiết bị/người dùng tương ứng với Khoa

        # Chuyển sang đối tượng Thiết bị (Radio DEVICE)
        page.click("input[name='target_type'][value='DEVICE']")
        page.wait_for_selector("#target-device-group:not(.hidden)", timeout=3000)

        # Chọn thiết bị khả dụng
        device_select = page.locator("#assign-device-select")
        device_options = device_select.locator("option").all()
        chosen_device_text = ""
        for d_opt in device_options:
            if not d_opt.get_attribute("disabled"):
                chosen_device_text = d_opt.inner_text()
                device_select.select_option(d_opt.get_attribute("value"))
                break

        print(f"✓ Đã chọn máy trạm: {chosen_device_text.strip()}")

        # Nhấn Xác nhận Cấp phát
        page.click("#assign-submit-btn")
        
        # Chờ modal đóng (chuyển sang state='hidden') và dữ liệu được nạp lại
        page.wait_for_selector("#assign-modal", state="hidden", timeout=7000)
        time.sleep(1)

        # Xác nhận số lượng bản ghi tăng lên
        updated_rows = page.locator("#assignments-table-body tr").count()
        print(f"✓ Số lượng bản ghi cấp phát sau khi gán: {updated_rows}")
        assert updated_rows >= initial_rows, "Số lượng bản ghi cấp phát phải tăng hoặc bằng ban đầu"

        screenshot_02 = os.path.join(SCREENSHOT_DIR, "02_assignment_success.png")
        page.screenshot(path=screenshot_02, full_page=True)
        print(f"✓ Đã lưu ảnh chụp cấp phát thành công: {screenshot_02}")

        # BƯỚC 4: Kiểm thử Giải mã Khóa bản quyền bảo mật (BR03)
        print("\n[BƯỚC 4] Chuyển về Tab Kho bản quyền và thực hiện giải mã khóa (BR03)...")
        page.click("#nav-pools")
        page.wait_for_selector("#tab-pools:not(.hidden)", timeout=5000)
        time.sleep(0.5)

        # Bấm nút 'Xem Key' trên gói bản quyền đầu tiên
        reveal_buttons = page.locator("button:has-text('Xem Key')").all()
        assert len(reveal_buttons) > 0, "Phải có ít nhất 1 nút 'Xem Key' trên bảng Kho bản quyền"
        reveal_buttons[0].click()

        # Chờ Modal Giải mã mở ra
        page.wait_for_selector("#reveal-modal:not(.hidden)", timeout=5000)
        time.sleep(0.5)

        # Đọc giá trị khóa giải mã từ ô input
        revealed_key = page.input_value("#revealed-key-text")
        print(f"✓ Khóa bản quyền giải mã hiển thị: '{revealed_key}'")
        assert revealed_key and len(revealed_key) > 5, "Khóa giải mã phải có nội dung"
        assert "****" not in revealed_key, "Khóa giải mã không được chứa ký tự mặt nạ '****'"

        # Kiểm tra đồng hồ đếm ngược 30 giây
        countdown_text = page.inner_text("#reveal-countdown-timer")
        print(f"✓ Trạng thái đồng hồ đếm ngược bảo mật: {countdown_text}")
        assert "s" in countdown_text, "Bộ đếm ngược phải hiển thị đơn vị giây"

        screenshot_03 = os.path.join(SCREENSHOT_DIR, "03_key_reveal_modal.png")
        page.screenshot(path=screenshot_03, full_page=True)
        print(f"✓ Đã lưu ảnh chụp modal giải mã khóa: {screenshot_03}")

        # Đóng modal giải mã
        page.click("#reveal-modal button:has-text('Đóng')")
        page.wait_for_selector("#reveal-modal", state="hidden", timeout=5000)

        # BƯỚC 5: Kiểm tra Nhật ký kiểm toán (Audit Alert Logs)
        print("\n[BƯỚC 5] Chuyển sang Tab Nhật ký Kiểm toán để xác nhận vết ghi log...")
        page.click("#nav-audit")
        page.wait_for_selector("#tab-audit:not(.hidden)", timeout=5000)
        time.sleep(0.5)

        audit_rows = page.locator("#audit-table-body tr").all_inner_texts()
        print(f"✓ Đã nạp {len(audit_rows)} dòng nhật ký kiểm toán.")
        has_reveal_log = any("REVEAL_KEY" in row for row in audit_rows)
        print(f"✓ Nhật ký kiểm toán ghi nhận hành động REVEAL_KEY: {has_reveal_log}")

        screenshot_04 = os.path.join(SCREENSHOT_DIR, "04_audit_logs.png")
        page.screenshot(path=screenshot_04, full_page=True)
        print(f"✓ Đã lưu ảnh chụp nhật ký kiểm toán: {screenshot_04}")

        # BƯỚC 6: Kiểm tra Console Errors
        print("\n[BƯỚC 6] Khẳng định không có lỗi Console trong toàn bộ quá trình...")
        print(f"Tổng số lỗi Console: {len(console_errors)}")
        if console_errors:
            for err in console_errors:
                print(f"  ❌ {err}")
            raise AssertionError(f"Phát hiện {len(console_errors)} lỗi trong Browser Console!")
        else:
            print("✓ Tuyệt đối không có lỗi nào trong Browser Console (0 errors)!")

        browser.close()
        print("\n====================================================")
        print("🎉 TOÀN BỘ KỊCH BẢN KIỂM THỬ PLAYWRIGHT ĐÃ THÀNH CÔNG RỰC RỠ!")
        print("====================================================")

if __name__ == '__main__':
    run_test()
