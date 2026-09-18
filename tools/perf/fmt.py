import sys, json
for l in sys.stdin:
    r = json.loads(l)
    print("%-16s mean %8.4f max %3d px>8: %7d (%s%%) bbox %s" % (r['name'], r['mean'], r['max'], r['over8'], r['pctOver8'], r['bbox8']))
