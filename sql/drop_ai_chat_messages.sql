-- =====================================================================
-- EXC PANELİ — drop_ai_chat_messages.sql
-- =====================================================================
-- "AI Asistan" sekmesi kaldırıldı (az kullanılıyordu + üretilen görseller
-- base64 olarak doğrudan bu tabloda saklandığından, tüm sohbet geçmişi
-- her tam veri yüklemesinde gereksiz yere çekiliyordu — egress'e gizli
-- bir yük bindiriyordu, kullanıcı talebi). Bu tabloyu ve içindeki tüm
-- sohbet geçmişini (biriken görseller dahil) kalıcı olarak kaldırır.
-- Supabase Dashboard > SQL Editor'de çalıştırın.
-- =====================================================================

drop table if exists ai_chat_messages;

notify pgrst, 'reload schema';
