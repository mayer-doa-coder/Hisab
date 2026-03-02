/**
 * dev-db.tsx  —  Live database inspector (DEV only)
 *
 * Navigate to /dev-db from any screen in __DEV__ mode.
 * Shows row counts, then lets you drill into every table's raw rows.
 * Automatically excluded from production builds by the __DEV__ guard
 * in _layout.tsx (Stack.Screen is only rendered in development).
 */

import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { Header } from "../components/ui/Header";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import { BodyText, Caption, TitleMedium } from "../components/ui/Typography";
import { BorderRadius, Palette, Spacing } from "../constants/theme";
import { db, dbReady, getDbBytes } from "../services/database";

// ── Types ────────────────────────────────────────────────────────────────────

type Row = Record<string, string | number | null>;

interface TableInfo {
  name: string;
  count: number;
}

// All V1 tables in the schema
const TABLES = [
  "customers",
  "transactions",
  "products",
  "sales",
  "sale_items",
  "weekly_sales",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTableCounts(): TableInfo[] {
  return TABLES.map((name) => {
    try {
      const row = db.getFirstSync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${name};`,
      );
      return { name, count: row?.n ?? 0 };
    } catch {
      return { name, count: -1 }; // table may not exist yet
    }
  });
}

function getTableRows(table: string): Row[] {
  try {
    return db.getAllSync<Row>(`SELECT * FROM ${table} ORDER BY rowid DESC;`);
  } catch {
    return [];
  }
}

/**
 * Export the live SQLite file so it can be opened with "SQLite Viewer" in VS Code.
 *
 * Web    — reads the base-64 blob from localStorage and triggers a browser download.
 *          Open the saved file directly in VS Code (SQLite Viewer picks it up).
 *
 * Mobile — shows the adb pull command; run `npm run db:pull` which saves the file
 *          to  dev/hisab.db  in the workspace so VS Code can open it.
 */
function exportDb(): void {
  if (Platform.OS === "web") {
    try {
      const bytes = getDbBytes();
      if (!bytes) {
        alert("Database is not ready yet — wait a moment and try again.");
        return;
      }
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "hisab.db";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export failed: ${String(e)}`);
    }
  } else {
    Alert.alert(
      "Export on Mobile",
      "Run this in your terminal to pull the DB to your workspace:\n\nnpm run db:pull\n\nThen open  dev/hisab.db  in VS Code with SQLite Viewer.",
      [{ text: "OK" }],
    );
  }
}

// ── Row renderer ─────────────────────────────────────────────────────────────

const RowCard: React.FC<{ row: Row }> = ({ row }) => (
  <View style={styles.rowCard}>
    {Object.entries(row).map(([key, val]) => (
      <View key={key} style={styles.field}>
        <Caption style={styles.fieldKey}>{key}</Caption>
        <BodyText style={styles.fieldVal} numberOfLines={3}>
          {val === null ? (
            <Caption style={{ color: Palette.grey400 }}>NULL</Caption>
          ) : (
            String(val)
          )}
        </BodyText>
      </View>
    ))}
  </View>
);

// ── Screen ───────────────────────────────────────────────────────────────────

export default function DevDbScreen() {
  const [dbReady_, setDbReady] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // On web, sql.js loads asynchronously — wait for it before querying.
  // On mobile dbReady resolves instantly so this is effectively synchronous.
  useEffect(() => {
    dbReady
      .catch(() => {}) // errors already logged by _layout.tsx
      .finally(() => {
        setTables(getTableCounts());
        setDbReady(true);
      });
  }, []);

  const openTable = useCallback(
    (name: string) => {
      if (active === name) {
        setActive(null);
        setRows([]);
        return;
      }
      setLoading(true);
      setActive(name);
      // Use setTimeout so the loading spinner actually renders before the
      // synchronous DB read blocks the JS thread for large tables.
      setTimeout(() => {
        setRows(getTableRows(name));
        setLoading(false);
      }, 0);
    },
    [active],
  );

  return (
    <View style={{ flex: 1, backgroundColor: Palette.offWhite }}>
      <Header title="DB Inspector" subtitle="dev-only · hisab.db" showBack />
      <ScreenContainer>
        {/* ── Export button ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={exportDb}
          activeOpacity={0.8}
        >
          <BodyText style={styles.exportBtnText}>
            ⬇{"  "}Export hisab.db → SQLite Viewer
          </BodyText>
          <Caption style={styles.exportBtnHint}>
            {Platform.OS === "web"
              ? "Downloads file — drag into VS Code to open"
              : "Run  npm run db:pull  in your terminal"}
          </Caption>
        </TouchableOpacity>

        {/* ── Table summary ─────────────────────────────────────────────── */}
        <TitleMedium style={styles.sectionTitle}>Tables</TitleMedium>
        {!dbReady_ ? (
          <ActivityIndicator
            color={Palette.primary}
            style={{ marginTop: Spacing.lg }}
          />
        ) : (
          tables.map((t) => (
            <TouchableOpacity
              key={t.name}
              style={[
                styles.tableBtn,
                active === t.name && styles.tableBtnActive,
              ]}
              onPress={() => openTable(t.name)}
              activeOpacity={0.75}
            >
              <BodyText
                style={[
                  styles.tableName,
                  active === t.name && { color: Palette.white },
                ]}
              >
                {t.name}
              </BodyText>
              <View
                style={[
                  styles.countBadge,
                  t.count === 0 && styles.countBadgeEmpty,
                ]}
              >
                <Caption
                  style={{
                    color: t.count > 0 ? Palette.dark : Palette.grey400,
                    fontWeight: "700",
                    fontSize: 11,
                  }}
                >
                  {t.count < 0 ? "ERR" : String(t.count)}
                </Caption>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* ── Row viewer ────────────────────────────────────────────────── */}
        {active && (
          <>
            <TitleMedium
              style={[styles.sectionTitle, { marginTop: Spacing.lg }]}
            >
              {active}{" "}
              <Caption style={{ color: Palette.grey400 }}>
                ({rows.length} rows, newest first)
              </Caption>
            </TitleMedium>

            {loading ? (
              <ActivityIndicator
                color={Palette.primary}
                style={{ marginTop: Spacing.lg }}
              />
            ) : rows.length === 0 ? (
              <Caption
                style={{ color: Palette.grey400, marginTop: Spacing.md }}
              >
                No rows in this table.
              </Caption>
            ) : (
              rows.map((row, i) => <RowCard key={i} row={row} />)
            )}
          </>
        )}
      </ScreenContainer>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  exportBtn: {
    backgroundColor: Palette.dark,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    gap: 2,
  },
  exportBtnText: {
    color: Palette.white,
    fontWeight: "700",
    fontSize: 14,
  },
  exportBtnHint: {
    color: Palette.grey400,
    fontSize: 11,
  },
  sectionTitle: {
    color: Palette.dark,
    marginBottom: Spacing.sm,
  },
  tableBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Palette.white,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Palette.grey200,
  },
  tableBtnActive: {
    backgroundColor: Palette.primary,
    borderColor: Palette.primary,
  },
  tableName: {
    fontWeight: "600",
    color: Palette.grey800,
    fontFamily: "monospace",
  },
  countBadge: {
    backgroundColor: Palette.primary + "33",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    minWidth: 32,
    alignItems: "center",
  },
  countBadgeEmpty: {
    backgroundColor: Palette.grey200,
  },
  rowCard: {
    backgroundColor: Palette.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Palette.grey200,
    borderLeftWidth: 3,
    borderLeftColor: Palette.secondary,
  },
  field: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: Palette.grey100,
  },
  fieldKey: {
    color: Palette.secondary,
    fontWeight: "600",
    width: 110,
    fontFamily: "monospace",
    flexShrink: 0,
  },
  fieldVal: {
    color: Palette.grey800,
    flex: 1,
    fontSize: 13,
  },
});
