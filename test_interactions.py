from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "screenshots" / "final"
OUT.mkdir(parents=True, exist_ok=True)


def uri(relative_path):
    return (ROOT / relative_path).resolve().as_uri()


def check_overflow(page, label):
    metrics = page.evaluate(
        """() => ({
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth
        })"""
    )
    if metrics["scrollWidth"] > metrics["innerWidth"] + 1:
        raise AssertionError(f"{label} horizontal overflow: {metrics}")
    print(f"  OK overflow {label}: {metrics}")


def new_page(browser, viewport):
    page = browser.new_page(viewport=viewport)
    errors = []
    page.on(
        "console",
        lambda msg: errors.append(msg.text) if msg.type == "error" else None,
    )
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    return page, errors


def test_home_and_links(browser):
    page, errors = new_page(browser, {"width": 1440, "height": 900})
    page.goto(uri("index.html"))
    page.wait_for_timeout(600)
    check_overflow(page, "home desktop")
    assert "丞丞的学习基地" in page.title()
    assert page.locator("text=丞丞的探索地图").count() == 1
    page.screenshot(path=OUT / "home-1440x900.png", full_page=True)

    page.locator('[data-open="english"]').first.click()
    page.locator("#toolModal.is-open").wait_for()
    page.locator("#enterTool").click()
    page.wait_for_url("**/tools/english/index.html")
    assert "英语记忆乐园" in page.title()
    check_overflow(page, "english desktop")
    page.screenshot(path=OUT / "english-1440x900.png", full_page=True)

    page.locator(".hub-home").click()
    page.wait_for_url("**/index.html")
    page.locator('.mainnav a[href="tools/hanzi/index.html"]').click()
    page.wait_for_url("**/tools/hanzi/index.html")
    assert "汉字笔顺" in page.title()
    check_overflow(page, "hanzi desktop")
    page.screenshot(path=OUT / "hanzi-1440x900.png", full_page=True)

    page.locator(".hub-home").click()
    page.wait_for_url("**/index.html")
    page.set_viewport_size({"width": 375, "height": 812})
    page.wait_for_timeout(1000)
    check_overflow(page, "home mobile")
    page.screenshot(path=OUT / "home-375x812.png", full_page=True)
    assert not errors, f"home/desktop console errors: {errors}"
    page.close()


def test_english_pages(browser):
    page, errors = new_page(browser, {"width": 1440, "height": 900})
    page.goto(uri("tools/english/index.html"))
    page.wait_for_timeout(500)
    page.set_viewport_size({"width": 375, "height": 812})
    page.wait_for_timeout(300)
    check_overflow(page, "english mobile")
    page.screenshot(path=OUT / "english-375x812.png", full_page=True)
    page.set_viewport_size({"width": 1440, "height": 900})
    page.wait_for_timeout(200)

    page.locator('a.book-card[href="英语小镇.html"]').click()
    page.wait_for_load_state("load")
    assert "英语小镇" in page.title()
    assert page.locator(".hub-nav").count() == 1

    page.goto(uri("tools/english/index.html"))
    page.locator('a.book-card[href="补充练习.html"]').click()
    page.wait_for_load_state("load")
    assert "补充练习册" in page.title()
    assert page.locator(".hub-nav").count() == 1

    page.goto(uri("tools/english/index.html"))
    page.locator('a.link-btn[href="声音试听.html"]').click()
    page.wait_for_load_state("load")
    assert "声音试听室" in page.title()
    assert page.locator(".hub-nav").count() == 1

    page.set_viewport_size({"width": 375, "height": 812})
    page.wait_for_timeout(250)
    check_overflow(page, "voice mobile")
    page.screenshot(path=OUT / "voice-375x812.png", full_page=True)
    assert not errors, f"english console errors: {errors}"
    page.close()


def test_hanzi_interactions(browser):
    page, errors = new_page(browser, {"width": 1440, "height": 900})
    page.goto(uri("tools/hanzi/index.html"))
    page.wait_for_timeout(500)
    assert page.locator(".hub-nav").count() == 1

    page.locator("#q").fill("人")
    page.locator("#q").press("Enter")
    page.wait_for_function(
        "() => document.querySelector('#meta').textContent.trim().length > 0",
        timeout=15000,
    )
    assert page.locator("#q").input_value() == "人"
    assert page.locator("#writer svg").count() == 1

    page.locator("details.picker > summary").click()
    page.locator("#tabs button").first.click()
    assert page.locator("#grid button").count() > 0
    page.screenshot(path=OUT / "hanzi-picker-1440x900.png", full_page=True)

    page.set_viewport_size({"width": 375, "height": 812})
    page.wait_for_timeout(300)
    check_overflow(page, "hanzi mobile")
    page.screenshot(path=OUT / "hanzi-375x812.png", full_page=True)
    page.set_viewport_size({"width": 1440, "height": 900})
    page.wait_for_timeout(200)

    page.locator(".hub-nav a[href='../english/index.html']").click()
    page.wait_for_url("**/tools/english/index.html")
    assert not errors, f"hanzi console errors: {errors}"
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        print("Testing home and cross-tool navigation")
        test_home_and_links(browser)
        print("Testing English pages")
        test_english_pages(browser)
        print("Testing Hanzi interactions")
        test_hanzi_interactions(browser)
        browser.close()
    print("All integration checks passed.")


if __name__ == "__main__":
    main()
