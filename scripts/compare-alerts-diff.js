import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runSendJob } from '../jobs/sendJob.js';
import { runDbComparison } from '../migration/generate-comparison-report.js';

function cleanMessageText(text) {
  if (!text) return '';
  return text.replace(/^\d+\.\s*/, '').trim();
}

function parseProductBlocks(category, messageList) {
  const blocks = new Map();

  for (const rawMsg of messageList) {
    const cleaned = cleanMessageText(rawMsg);
    // Each product alert block starts with *Product Title*
    const segments = cleaned.split(/\n\n(?=\*[^*]+\*)/);

    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;

      const firstLine = trimmed.split('\n')[0].replace(/^\*|\*$/g, '').trim();
      const uniqueKey = `[${category}] ${firstLine}`;

      blocks.set(uniqueKey, {
        category,
        title: firstLine,
        rawText: trimmed,
        lines: trimmed.split('\n').map((l) => l.trim()),
      });
    }
  }

  return blocks;
}

function diffLines(cacheLines, dbLines) {
  const differences = [];
  const maxLen = Math.max(cacheLines.length, dbLines.length);

  for (let i = 0; i < maxLen; i++) {
    const cLine = cacheLines[i] ?? null;
    const dLine = dbLines[i] ?? null;

    if (cLine !== dLine) {
      differences.push({
        lineIndex: i + 1,
        cacheLine: cLine,
        dbLine: dLine,
      });
    }
  }

  return differences;
}

export async function compareAlerts(saveToFile = true) {
  console.log('🔄 1/2 Loading cache-based comparisons (runSendJob)...');
  const cacheResultsByCategory = await runSendJob(false, false);

  console.log('🔄 2/2 Loading DB-based comparisons (runDbComparison)...');
  const dbMessages = await runDbComparison(null, null);

  const dbResultsByCategory = {};
  for (const item of dbMessages) {
    if (!dbResultsByCategory[item.category]) {
      dbResultsByCategory[item.category] = [];
    }
    dbResultsByCategory[item.category].push(item.text);
  }

  const allCategories = Array.from(
    new Set([
      ...Object.keys(cacheResultsByCategory),
      ...Object.keys(dbResultsByCategory),
    ]),
  );

  const cacheProducts = new Map();
  const dbProducts = new Map();

  for (const cat of allCategories) {
    const cList = cacheResultsByCategory[cat] || [];
    const dList = dbResultsByCategory[cat] || [];

    const cParsed = parseProductBlocks(cat, cList);
    const dParsed = parseProductBlocks(cat, dList);

    for (const [k, v] of cParsed) cacheProducts.set(k, v);
    for (const [k, v] of dParsed) dbProducts.set(k, v);
  }

  const fullMatches = {};
  const changesOnly = {};

  const allProductKeys = Array.from(
    new Set([...cacheProducts.keys(), ...dbProducts.keys()]),
  ).sort();

  for (const key of allProductKeys) {
    const cProd = cacheProducts.get(key);
    const dProd = dbProducts.get(key);

    if (cProd && dProd) {
      const lineDiffs = diffLines(cProd.lines, dProd.lines);

      if (lineDiffs.length === 0) {
        fullMatches[key] = {
          category: cProd.category,
          title: cProd.title,
        };
      } else {
        changesOnly[key] = {
          changeType: 'LINE_CHANGES',
          category: cProd.category,
          title: cProd.title,
          differenceCount: lineDiffs.length,
          lineDiffs: lineDiffs.map((d) => ({
            line: d.lineIndex,
            cache: d.cacheLine,
            db: d.dbLine,
          })),
          fullCacheAlert: cProd.rawText,
          fullDbAlert: dProd.rawText,
        };
      }
    } else if (cProd && !dProd) {
      changesOnly[key] = {
        changeType: 'MISSING_IN_DB',
        category: cProd.category,
        title: cProd.title,
        explanation: 'Alert exists in cache comparison, but was NOT produced by DB comparison',
        fullCacheAlert: cProd.rawText,
      };
    } else if (!cProd && dProd) {
      changesOnly[key] = {
        changeType: 'NEW_IN_DB',
        category: dProd.category,
        title: dProd.title,
        explanation: 'Alert was NOT in cache comparison, but appeared in DB comparison',
        fullDbAlert: dProd.rawText,
      };
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalAlertsCompared: allProductKeys.length,
      fullMatchesCount: Object.keys(fullMatches).length,
      totalChangesCount: Object.keys(changesOnly).length,
      breakdown: {
        lineDifferences: Object.values(changesOnly).filter((c) => c.changeType === 'LINE_CHANGES').length,
        missingInDb: Object.values(changesOnly).filter((c) => c.changeType === 'MISSING_IN_DB').length,
        newInDb: Object.values(changesOnly).filter((c) => c.changeType === 'NEW_IN_DB').length,
      },
    },
    fullMatches,
    changes: changesOnly,
  };

  if (saveToFile) {
    const outputPath = path.resolve('comparison_diff_result.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`\n📄 Saved JSON report to: ${outputPath}`);
  }

  // Print Clean Console Summary
  console.log('\n======================================================');
  console.log('           📊 ALERT COMPARISON DIFF SUMMARY           ');
  console.log('======================================================');
  console.log(`Total Products with Alerts : ${result.summary.totalAlertsCompared}`);
  console.log(`✅ Identical (Full Matches) : ${result.summary.fullMatchesCount}`);
  console.log(`⚠️  Total Changes Found     : ${result.summary.totalChangesCount}`);
  console.log(`   ├─ 📝 Line differences   : ${result.summary.breakdown.lineDifferences}`);
  console.log(`   ├─ ❌ Missing in DB      : ${result.summary.breakdown.missingInDb}`);
  console.log(`   └─ 🆕 New in DB          : ${result.summary.breakdown.newInDb}`);
  console.log('======================================================\n');

  if (result.summary.totalChangesCount > 0) {
    console.log('🔎 DETAILED LIST OF CHANGES:\n');
    for (const [key, ch] of Object.entries(changesOnly)) {
      if (ch.changeType === 'LINE_CHANGES') {
        console.log(`🔸 [MODIFIED] ${key}`);
        for (const diff of ch.lineDiffs) {
          console.log(`   Line ${diff.line}:`);
          console.log(`     - Cache: ${diff.cache || '(empty)'}`);
          console.log(`     + DB:    ${diff.db || '(empty)'}`);
        }
      } else if (ch.changeType === 'MISSING_IN_DB') {
        console.log(`🔴 [MISSING IN DB] ${key}`);
      } else if (ch.changeType === 'NEW_IN_DB') {
        console.log(`🟢 [NEW IN DB] ${key}`);
      }
      console.log('------------------------------------------------------');
    }
  } else {
    console.log('🎉 100% Match! No alert discrepancies between Cache and DB.');
  }

  return result;
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith('compare-alerts-diff.js') ||
  process.argv[1].endsWith('compare-alerts-diff')
);

if (isMain) {
  compareAlerts(true).catch((err) => {
    console.error('❌ Error during comparison:', err);
    process.exit(1);
  });
}
