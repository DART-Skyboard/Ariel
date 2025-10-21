from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://127.0.0.1:5000")
        page.screenshot(path="jules-scratch/verification/verification.png")
        browser.close()

run()
