const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'v4')
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

;(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)

  // 01 - Landing page (hero section)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-landing.png'), fullPage: false })
  console.log('01-landing.png captured')

  // Scroll to game section
  await page.evaluate(() => document.getElementById('game')?.scrollIntoView({ behavior: 'instant' }))
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-game-idle.png'), fullPage: false })
  console.log('02-game-idle.png captured')

  // Enter name
  const enterBtn = await page.locator('button', { hasText: /ENTER THE REALM/i }).first()
  if (await enterBtn.isVisible()) await enterBtn.click()
  await page.waitForTimeout(400)

  const input = await page.locator('input[type="text"]').first()
  if (await input.isVisible()) {
    await input.fill('HERO')
    const nextBtn = await page.locator('button', { hasText: /NEXT/i }).first()
    if (await nextBtn.isVisible()) await nextBtn.click()
  }
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-class-select.png'), fullPage: false })
  console.log('03-class-select.png captured')

  // Enter world
  const enterWorldBtn = await page.locator('button', { hasText: /ENTER WORLD/i }).first()
  if (await enterWorldBtn.isVisible()) await enterWorldBtn.click()
  await page.waitForTimeout(3500) // Wait for loading screen
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-loading.png'), fullPage: false })
  console.log('04-loading.png captured')

  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-game-playing.png'), fullPage: false })
  console.log('05-game-playing.png captured')

  // Move player
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(800)
  await page.keyboard.up('KeyD')
  await page.keyboard.down('KeyS')
  await page.waitForTimeout(600)
  await page.keyboard.up('KeyS')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-game-moved.png'), fullPage: false })
  console.log('06-game-moved.png captured')

  // Attack
  await page.keyboard.press('Space')
  await page.waitForTimeout(600)
  await page.keyboard.press('KeyQ')
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07-after-attack.png'), fullPage: false })
  console.log('07-after-attack.png captured')

  await browser.close()
  console.log('All v4 screenshots captured successfully!')
})()
