package com.meko.vitafocus;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.HashMap;
import java.util.Map;

public final class ActivityStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "vitafocus.db";
    private static final int DB_VERSION = 1;

    public ActivityStore(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE entries (slot_start INTEGER PRIMARY KEY, category TEXT NOT NULL, updated_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX idx_entries_updated ON entries(updated_at)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS entries");
        onCreate(db);
    }

    public void setCategory(long slotStart, String category) {
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("INSERT OR REPLACE INTO entries(slot_start, category, updated_at) VALUES(?,?,?)",
                new Object[]{slotStart, category, System.currentTimeMillis()});
    }

    public void delete(long slotStart) {
        getWritableDatabase().delete("entries", "slot_start=?", new String[]{String.valueOf(slotStart)});
    }

    public String getCategory(long slotStart) {
        Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT category FROM entries WHERE slot_start=?",
                new String[]{String.valueOf(slotStart)});
        try {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        } finally {
            cursor.close();
        }
    }

    public Map<Long, String> getBetween(long startInclusive, long endExclusive) {
        Map<Long, String> result = new HashMap<>();
        Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT slot_start, category FROM entries WHERE slot_start>=? AND slot_start<? ORDER BY slot_start",
                new String[]{String.valueOf(startInclusive), String.valueOf(endExclusive)});
        try {
            while (cursor.moveToNext()) result.put(cursor.getLong(0), cursor.getString(1));
        } finally {
            cursor.close();
        }
        return result;
    }

    public void clearAll() {
        getWritableDatabase().delete("entries", null, null);
    }
}
