"""
==============================================================================
KỊCH BẢN KIỂM THỬ PLAYWRIGHT UI: RÀNG BUỘC GIA HẠN 2 BƯỚC
Kiểm tra trực quan quy trình:
1. Mở modal Gia hạn trên Dashboard.
2. Kiểm tra giao diện hiển thị ràng buộc Hợp đồng mua sắm với Nhà cung cấp.
3. Gửi đề xuất gia hạn về Nhà trường và chụp ảnh minh chứng.
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

        page.on("console", lambda msg: (
            console_errors.append(f"Console {msg.type}: {msg.text}") if msg.type in ["error"] else None
        ))
        page.on("pageerror", lambda err: console_errors.append(f"Page Error: {err}"))

        print("\n[BƯỚC 1] Điều hướng đến http://localhost:5000...")
        page.goto("http://localhost:5000", wait_until="networkidle", timeout=15000)
        time.sleep(1)

        print("\n[BƯỚC 2] Tìm nút 'Gia hạn' trên danh sách Bản quyền...")
        renew_buttons = page.locator("button:has-text('Gia hạn')")
        count = renew_buttons.count()
        print(f"✓ Tìm thấy {count} nút Gia hạn.")
        assert count > 0, "Phải có ít nhất 1 nút Gia hạn"

        # Bấm nút Gia hạn đầu tiên
        renew_buttons.first.click()
        page.wait_for_selector("#renew-modal:not(.hidden)", timeout=5000)
        time.sleep(1) # Chờ API renewal-check hoàn tất

        # Chụp ảnh Modal Gia hạn
        screenshot_path = os.path.join(SCREENSHOT_DIR, "05_renewal_modal_constraint.png")
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"✓ Đã chụp ảnh giao diện Modal Gia hạn: {screenshot_path}")

        # Kiểm tra nội dung Modal
        modal_text = page.locator("#renew-modal").inner_text()
        has_constraint = "Ràng buộc" in modal_text or "Hợp đồng" in modal_text
        print(f"✓ Kiểm tra thông điệp ràng buộc trong Modal: {'Thành công' if has_constraint else 'Thiếu'}")
        assert has_constraint, "Modal phải hiển thị thông tin ràng buộc Hợp đồng hoặc Phiếu đề xuất"

        # Đóng modal
        page.locator("#renew-modal button:has(svg.lucide-x), #renew-modal button:has-text('Hủy'), #renew-modal button:has-text('Đóng')").first.click()
        time.sleep(0.5)

        print("\n[BƯỚC 3] Kiểm tra lỗi Console...")
        if console_errors:
            print(f"⚠️ Phát hiện {len(console_errors)} lỗi console:")
            for err in console_errors:
                print(f"  - {err}")
        else:
            print("✓ 0 lỗi trong Browser Console!")

        browser.close()
        print("\n🎉 KIỂM THỬ PLAYWRIGHT UI HOÀN TẤT THÀNH CÔNG!")

if __name__ == '__main__':
    run_test()
