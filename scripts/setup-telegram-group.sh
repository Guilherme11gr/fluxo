#!/bin/bash
# Configurar Telegram group para Kai

BOT_TOKEN="8394542328:AAGz7IetcW3Q2vjUyM2V4gvFcuTbeQG3gHc"
GROUP_ID="-5826677098"

# Pegar info do bot
BOT_INFO=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe")
BOT_USERNAME=$(echo $BOT_INFO | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
BOT_NAME=$(echo $BOT_INFO | grep -o '"first_name":"[^"]*"' | cut -d'"' -f4)

echo "Bot: $BOT_NAME (@$BOT_USERNAME)"
echo "Grupo: $GROUP_ID"

# Testar enviar mensagem pro grupo
curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=${GROUP_ID}" \
  -d "text=✅ Kai configurado no grupo! Mencione @${BOT_USERNAME} para falar comigo."
