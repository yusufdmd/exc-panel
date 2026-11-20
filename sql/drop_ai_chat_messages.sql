-- =====================================================================
-- EXC PANELİ — drop_ai_chat_messages.sql
-- =====================================================================
-- "AI Asistan" sekmesi kaldırıldı (az kullanılıyordu + üretilen görseller
-- base64 olarak doğrudan bu tabloda saklandığından, tüm sohbet geçmişi
-- her tam veri yüklemesinde gereksiz yere çekiliyordu — egress'e gizli
-- bir yük bindiriyordu, kullanıcı talebi). Bu tabloyu ve içindeki tüm
-- sohbet geçmişini (biriken görseller dahil) kalıcı olarak kaldırır.
-- Supabase Dashboard > SQL Editor'de çalıştırın.
--
-- NOT: Bu migration zaten çalıştırıldı ve tablo kaldırıldı (2026-11-20'de
-- doğrulandı — PostgREST artık bu tabloyu 404 ile döndürüyor). Dosya
-- sadece geçmiş kayıt olarak tutuluyor.
-- =====================================================================

drop table if exists ai_chat_messages;

notify pgrst, 'reload schema';
