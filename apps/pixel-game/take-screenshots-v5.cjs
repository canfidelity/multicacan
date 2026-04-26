const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded', timeout: 30000 })
  // Wait for React to hydrate (not LOADING...)
  await page.waitForFunction(() => !document.body.innerText.trim().startsWith('LOADING'), { timeout: 15000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'screenshots/v5/01-landing.png', fullPage: false })
  console.log('01 - landing done')

  // Scroll to game section
  await page.evaluate(() => document.getElementById('game')?.scrollIntoView())
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'screenshots/v5/02-game-section.png' })
  console.log('02 - game section done')

  // Click Enter the Realm - try multiple selectors
  const enterBtn = page.getByRole('button', { name: /enter the realm/i })
  if (await enterBtn.count() > 0) {
    await enterBtn.first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'screenshots/v5/03-name-input.png' })
    console.log('03 - name input done')

    // Fill name
    const nameInput = page.locator('input[type="text"]')
    await nameInput.fill('HEROTEST')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'screenshots/v5/04-class-select.png' })
    console.log('04 - class select done')

    // Click Enter World
    const worldBtn = page.getByRole('button', { name: /enter world/i })
    if (await worldBtn.count() > 0) {
      await worldBtn.click()
      await page.waitForTimeout(5000)  // loading screen
      await page.screenshot({ path: 'screenshots/v5/05-after-loading.png' })
      console.log('05 - after loading')
    }
  } else {
    console.log('Enter button not found, checking page...')
    console.log(await page.locator('button').allTextContents())
  }

  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'screenshots/v5/06-game-playing.png' })
  console.log('06 - game playing done')

  // Try to interact with canvas
  const canvas = page.locator('canvas').first()
  if (await canvas.count() > 0) {
    await canvas.click()
    await page.waitForTimeout(300)
    // Move right
    for (let i = 0; i < 40; i++) {
      await page.keyboard.down('D')
      await page.waitForTimeout(40)
    }
    await page.keyboard.up('D')
    await page.waitForTimeout(600)
    await page.screenshot({ path: 'screenshots/v5/07-moved.png' })
    console.log('07 - moved done')

    // Attack
    await page.keyboard.press('Space')
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'screenshots/v5/08-attacked.png' })
    console.log('08 - attacked done')

    // Use skill Q
    await page.keyboard.press('q')
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'screenshots/v5/09-skill.png' })
    console.log('09 - skill done')
  }

  await browser.close()
  console.log('All screenshots done!')
}

main().catch(err => { console.error(err); process.exit(1) })
