# Déploiement API NinjaTrader 8 sur seoparai.com

## 1. Copier les fichiers sur le serveur

```bash
ssh -i ~/.ssh/id_ed25519_michael ubuntu@148.113.194.234

# Créer le dossier
sudo mkdir -p /opt/mcp-ninjatrader
sudo chown ubuntu:ubuntu /opt/mcp-ninjatrader
```

Depuis le local:
```bash
rsync -avz -e "ssh -i ~/.ssh/id_ed25519_michael" \
  /home/serinityvault/Desktop/NinjaTrader/mcp-server/ \
  ubuntu@148.113.194.234:/opt/mcp-ninjatrader/ \
  --exclude node_modules --exclude .git
```

## 2. Installer les dépendances sur le serveur

```bash
ssh -i ~/.ssh/id_ed25519_michael ubuntu@148.113.194.234
cd /opt/mcp-ninjatrader
npm install --production
```

## 3. Copier les scripts NT8

```bash
rsync -avz -e "ssh -i ~/.ssh/id_ed25519_michael" \
  /home/serinityvault/Desktop/NinjaTrader/scripts/ \
  ubuntu@148.113.194.234:/opt/mcp-ninjatrader/scripts/
```

## 4. Installer le service systemd

```bash
sudo cp deploy/nt8-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable nt8-api
sudo systemctl start nt8-api
sudo systemctl status nt8-api
```

## 5. Configurer nginx

Ajouter le contenu de `deploy/nginx-nt8-api.conf` dans le server block SSL de seoparai.com:

```bash
sudo nano /etc/nginx/sites-available/seoparai.com
# Ajouter le bloc location /api/nt8/ avant le } final du server block SSL
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Tester

```bash
curl https://seoparai.com/api/nt8/health
```

## 7. Créer le Custom GPT

Voir CUSTOM-GPT-INSTRUCTIONS.md
