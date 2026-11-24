#!/bin/sh
# Writes /etc/nginx/real-ip.conf, which nginx.conf includes, from TRUSTED_PROXY.
#
# Unset: the default (real-ip.default.conf), which is what this image always did: trust
# the compose bridge, where the bundled cloudflared and Caddy sit, and read
# CF-Connecting-IP. The file is copied on every start, because a restarted container
# keeps its filesystem and would otherwise keep an earlier TRUSTED_PROXY.
#
# Set: trust only the addresses listed (a comma-separated list of IPs or CIDRs, for a
# reverse proxy on another machine) and read X-Forwarded-For. The bridge is NOT kept.
# The bundled proxies don't run in this mode, and on Docker Desktop every outside
# connection to a published port arrives from a 172.x gateway, so keeping the bridge
# would let anyone who can reach the port claim any client IP.
#
# This is a config-injection boundary: the value ends up inside nginx config, so it is
# checked here again even though ./portal checked it, and nothing but a validated
# address is ever written. A bad value stops the container rather than falling back to
# the default, which would quietly trust something the owner didn't ask for.
# scripts/check-security.ts runs this file with sh.
set -eu

out="${REAL_IP_CONF:-/etc/nginx/real-ip.conf}"
default="${REAL_IP_DEFAULT:-/etc/nginx/real-ip.default.conf}"

if [ -z "${TRUSTED_PROXY:-}" ]; then
  cp "$default" "$out"
  exit 0
fi

tmp="$out.tmp"
if ! {
  echo "# Written at container start from TRUSTED_PROXY. Do not edit."
  awk '
    function v4(s,   p, i) {
      if (s !~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) return 0
      split(s, p, ".")
      for (i = 1; i <= 4; i++) {
        if (length(p[i]) > 3 || p[i] + 0 > 255) return 0
        if (length(p[i]) > 1 && substr(p[i], 1, 1) == "0") return 0
      }
      return 1
    }
    function v6(s,   p, n, i, g, t, dbl, cnt) {
      if (s !~ /^[0-9A-Fa-f:.]+$/ || s !~ /:/ || s ~ /:::/) return 0
      t = s
      dbl = gsub(/::/, "::", t)
      if (dbl > 1) return 0
      if (s ~ /^:[^:]/ || s ~ /[^:]:$/) return 0
      n = split(s, p, ":")
      cnt = 0
      for (i = 1; i <= n; i++) {
        g = p[i]
        if (g == "") continue
        if (g ~ /\./) {
          if (i != n || !v4(g)) return 0
          cnt += 2
        } else {
          if (g !~ /^[0-9A-Fa-f]+$/ || length(g) > 4) return 0
          cnt++
        }
      }
      if (dbl) return cnt <= 7
      return cnt == 8
    }
    function ok(item,   a, n, max) {
      n = split(item, a, "/")
      if (n > 2) return 0
      if (v4(a[1])) max = 32
      else if (v6(a[1])) max = 128
      else return 0
      if (n == 2) {
        if (a[2] !~ /^[0-9]+$/ || length(a[2]) > 3 || a[2] + 0 > max) return 0
      }
      return 1
    }
    BEGIN {
      v = ENVIRON["TRUSTED_PROXY"]
      # The whole value first: this rules out spaces, newlines, braces, semicolons and
      # hostnames before anything is split or written.
      if (v !~ /^[0-9A-Fa-f:.\/,]+$/) { bad = v; exit 2 }
      n = split(v, items, ",")
      for (i = 1; i <= n; i++) {
        if (!ok(items[i])) { bad = items[i]; exit 2 }
        print "set_real_ip_from " items[i] ";"
      }
      print "real_ip_header X-Forwarded-For;"
      print "real_ip_recursive on;"
    }
  '
} > "$tmp"; then
  rm -f "$tmp"
  echo "40-trusted-proxy.sh: TRUSTED_PROXY is not a comma-separated list of IP addresses or CIDRs (for example 203.0.113.7 or 10.0.0.0/8,2001:db8::/32). Refusing to start." >&2
  exit 1
fi
mv "$tmp" "$out"
