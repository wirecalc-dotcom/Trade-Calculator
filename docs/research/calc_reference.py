"""Reference implementation + test cases for wirecalculators.com MVP calculators.
Values: NEC Chapter 9 Tables 1, 4, 5, 8, 9; Table 310.16; 240.4(D); Table 310.15(C)(1).
Every table value must be re-checked against the adopted code book before launch
(see calculator-math-research.md, "verification status")."""
import math

SIZES = ["14","12","10","8","6","4","3","2","1","1/0","2/0","3/0","4/0",
         "250","300","350","400","500","600","750","1000"]

# --- Chapter 9 Table 8: area (cmil), DC resistance ohm/kft at 75C (stranded, uncoated Cu; Al)
CMIL = dict(zip(SIZES,[4110,6530,10380,16510,26240,41740,52620,66360,83690,105600,133100,
                       167800,211600,250000,300000,350000,400000,500000,600000,750000,1000000]))
R_DC_CU = dict(zip(SIZES,[3.14,1.98,1.24,0.778,0.491,0.308,0.245,0.194,0.154,0.122,0.0967,
                          0.0766,0.0608,0.0515,0.0429,0.0367,0.0321,0.0258,0.0214,0.0171,0.0129]))
R_DC_AL = dict(zip(SIZES,[5.17,3.25,2.04,1.28,0.808,0.508,0.403,0.319,0.253,0.201,0.159,
                          0.126,0.100,0.0847,0.0707,0.0605,0.0529,0.0424,0.0353,0.0282,0.0212]))

# --- Chapter 9 Table 9 (ohm-to-neutral /kft, 75C): XL (pvc_al, steel); R Cu (pvc, al, steel); R Al (pvc, al, steel)
T9 = {
 "14":((.058,.073),(3.1,3.1,3.1),(None,None,None)),
 "12":((.054,.068),(2.0,2.0,2.0),(3.2,3.2,3.2)),
 "10":((.050,.063),(1.2,1.2,1.2),(2.0,2.0,2.0)),
 "8":((.052,.065),(.78,.78,.78),(1.3,1.3,1.3)),
 "6":((.051,.064),(.49,.49,.49),(.81,.81,.81)),
 "4":((.048,.060),(.31,.31,.31),(.51,.51,.51)),
 "3":((.047,.059),(.25,.25,.25),(.40,.41,.40)),
 "2":((.045,.057),(.19,.20,.20),(.32,.32,.32)),
 "1":((.046,.057),(.15,.16,.16),(.25,.26,.25)),
 "1/0":((.044,.055),(.12,.13,.12),(.20,.21,.20)),
 "2/0":((.043,.054),(.10,.11,.10),(.16,.16,.16)),
 "3/0":((.042,.052),(.077,.082,.079),(.13,.13,.13)),
 "4/0":((.041,.051),(.062,.067,.063),(.10,.11,.10)),
 "250":((.041,.052),(.052,.057,.054),(.085,.090,.086)),
 "300":((.041,.051),(.044,.049,.045),(.071,.076,.072)),
 "350":((.040,.050),(.038,.043,.039),(.061,.066,.063)),
 "400":((.040,.049),(.033,.038,.035),(.054,.059,.055)),
 "500":((.039,.048),(.027,.032,.029),(.043,.048,.045)),
 "600":((.039,.048),(.023,.028,.025),(.036,.041,.038)),
 "750":((.038,.048),(.019,.024,.021),(.029,.034,.031)),
 "1000":((.037,.046),(.015,.019,.018),(.023,.027,.025)),
}
CONDUIT_IDX = {"pvc":0,"al":1,"steel":2}

# --- Table 310.16 (60/75/90 C), 30C ambient, <=3 CCC
AMP_CU = dict(zip(SIZES,[(15,20,25),(20,25,30),(30,35,40),(40,50,55),(55,65,75),(70,85,95),
  (85,100,115),(95,115,130),(110,130,145),(125,150,170),(145,175,195),(165,200,225),
  (195,230,260),(215,255,290),(240,285,320),(260,310,350),(280,335,380),(320,380,430),
  (350,420,475),(400,475,535),(455,545,615)]))
AMP_AL = dict(zip(SIZES[1:],[(15,20,25),(25,30,35),(35,40,45),(40,50,55),(55,65,75),
  (65,75,85),(75,90,100),(85,100,115),(100,120,135),(115,135,150),(130,155,175),
  (150,180,205),(170,205,230),(195,230,260),(210,250,280),(225,270,305),(260,310,350),
  (285,340,385),(320,385,435),(375,445,500)]))
OCPD_LIMIT_240_4D = {("cu","14"):15,("cu","12"):20,("cu","10"):30,("al","12"):15,("al","10"):25}
ADJ_310_15C1 = [(3,1.0),(6,.80),(9,.70),(20,.50),(30,.45),(40,.40),(10**9,.35)]

# --- Chapter 9 Table 4 (40% area, in^2) and Table 5 (THHN/THWN-2 area, in^2)
EMT40 = {"1/2":.122,"3/4":.213,"1":.346,"1-1/4":.598,"1-1/2":.814,"2":1.342}
PVC40_40 = {"1/2":.114,"3/4":.203,"1":.333,"1-1/4":.581,"1-1/2":.794,"2":1.316}
RMC40 = {"1/2":.125,"3/4":.220,"1":.355,"1-1/4":.610,"1-1/2":.829,"2":1.363}
THHN = dict(zip(SIZES[:13],[.0097,.0133,.0211,.0366,.0507,.0824,.0973,.1158,.1562,.1855,
                            .2223,.2679,.3237]))

# ---------------- calculators ----------------
def vd_k(material, size, amps, feet, phase, sets=1):
    """Circular-mil method (Table 8 basis). K = 12.9 Cu / 21.2 Al."""
    K = 12.9 if material=="cu" else 21.2
    mult = 2 if phase==1 else math.sqrt(3)
    return mult*K*(amps/sets)*feet/CMIL[size]

def vd_table8(material, size, amps, feet, phase, sets=1, temp_c=75):
    R = (R_DC_CU if material=="cu" else R_DC_AL)[size]
    alpha = 0.00323 if material=="cu" else 0.00330
    R *= 1+alpha*(temp_c-75)                     # Table 8 Note 2
    mult = 2 if phase==1 else math.sqrt(3)
    return mult*(amps/sets)*R*feet/1000

def vd_table9(material, size, amps, feet, phase, pf=0.85, conduit="pvc", sets=1):
    """Ch. 9 Table 9 Note 2: Zeff = R*PF + XL*sin(acos PF)."""
    xl = T9[size][0][0 if conduit in ("pvc","al") else 1]
    R = T9[size][1 if material=="cu" else 2][CONDUIT_IDX[conduit]]
    z = R*pf + xl*math.sin(math.acos(pf))
    mult = 2 if phase==1 else math.sqrt(3)
    return mult*(amps/sets)*z*feet/1000

def ampacity(material, size, col_c, ambient_factor=1.0, ccc=3):
    tbl = AMP_CU if material=="cu" else AMP_AL
    base = tbl[size][{60:0,75:1,90:2}[col_c]]
    adj = next(f for n,f in ADJ_310_15C1 if ccc<=n)
    return base*ambient_factor*adj

def min_size_for_load(material, amps, term_c):
    tbl = AMP_CU if material=="cu" else AMP_AL
    for s in tbl:
        a = tbl[s][{60:0,75:1,90:2}[term_c]]
        lim = OCPD_LIMIT_240_4D.get((material,s))
        if a>=amps and (lim is None or lim>=amps):
            return s

def max_same_size(area40, conductor_area):
    q = area40/conductor_area
    return math.floor(q) + (1 if q-math.floor(q)>=0.8 else 0)   # Ch.9 Note 7

def watts(volts, amps, phase="dc", pf=1.0):
    if phase=="dc": return volts*amps
    if phase==1: return volts*amps*pf
    return math.sqrt(3)*volts*amps*pf

def amps_from_watts(w, volts, phase="dc", pf=1.0):
    return w/watts(volts,1,phase,pf)

def gen_size(loads, method="largest_start_replaces_run"):
    """loads: list of (running_w, starting_w). Returns (running_total, surge_needed)."""
    run = sum(r for r,_ in loads)
    if method=="add_full_start":                       # Champion/Murdoch's convention
        surge = run + max(s for _,s in loads)
    else:                                              # Cummins convention
        surge = max(run - r + s for r,s in loads)
    return run, surge

# ---------------- tests (expected values from published sources) ----------------
def close(a,b,tol): return abs(a-b)<=tol
T = []
def check(name, got, exp, tol, src):
    ok = close(got,exp,tol) if isinstance(exp,(int,float)) else got==exp
    T.append((name, round(got,4) if isinstance(got,float) else got, exp, "PASS" if ok else "FAIL", src))

# Voltage drop
check("VD K: 12Cu 12A 100ft 1ph", vd_k("cu","12",12,100,1), 4.74, .01, "PDHonline E426 Ex.2")
check("VD Zeff .85: 12Cu PVC 12A 100ft 1ph", vd_table9("cu","12",12,100,1,.85,"pvc"), 4.08, .02, "PDHonline E426 Ex.1 (table Zeff 1.7)")
check("VD K: 4Cu 65A 200ft 3ph", vd_k("cu","4",65,200,3), 6.96, .01, "PDHonline E426 Ex.4")
check("VD Zeff: 12Cu steel 14A 200ft 3ph pf.85", vd_table9("cu","12",14,200,3,.85,"steel"), 8.418, .01, "PDHonline E426 Fig.23")
check("VD R only: 10Cu steel 18A 200ft 3ph pf1", vd_table9("cu","10",18,200,3,1.0,"steel"), 7.482, .01, "PDHonline E426 Fig.24")
check("VD Zeff: 500Cu steel 302A 200ft 3ph pf.9", vd_table9("cu","500",302,200,3,.9,"steel"), 4.92, .02, "PDHonline E426 Fig.25")
check("VD Zeff: 10Cu steel 10A 100ft 1ph pf.9", vd_table9("cu","10",10,100,1,.9,"steel"), 2.215, .01, "PDHonline E426 Ex.7")
check("VD Zeff: 3/0Cu steel 150A 500ft 3ph pf.8", vd_table9("cu","3/0",150,500,3,.8,"steel"), 12.26, .02, "PDHonline E426 EGC example")
check("VD Zeff: 4/0Cu steel 150A 500ft 3ph pf.8", vd_table9("cu","4/0",150,500,3,.8,"steel"), 10.52, .02, "PDHonline E426 EGC example")
check("VD Zeff: 600Al PVC 270A 250ft 3ph pf.7", vd_table9("al","600",270,250,3,.7,"pvc"), 6.208, .02, "electrical-knowhow Ex.5")
check("VD Zeff: 1Cu Al-conduit 100A 150ft 3ph pf.85", vd_table9("cu","1",100,150,3,.85,"al"), 4.157, .03, "electrical-knowhow Ex.4 (NEC Handbook ex.)")
check("Table 8 Note 2: 500Cu at 90C (ohm/kft)", R_DC_CU["500"]*(1+.00323*15), 0.02705, .00002, "electrical-knowhow Ex.1")
check("Table 8 Note 2: 8Cu at 90C (ohm/kft)", R_DC_CU["8"]*(1+.00323*15), 0.8157, .0002, "EC&M 'How to use Chapter 9'")
check("Circular mils needed: 115V 52A 110ft 3%", 2*12.9*52*110/(115*.03), 42775, 5, "Mike Holt forum exam answer key inputs")

# Conduit fill
check("12 THHN in 3/4 EMT", max_same_size(EMT40["3/4"],THHN["12"]), 16, 0, "Annex C C.1 via open-exam-prep / PES")
check("12 THHN in 1/2 EMT", max_same_size(EMT40["1/2"],THHN["12"]), 9, 0, "PES EMT chart")
check("14 THHN in 1/2 EMT", max_same_size(EMT40["1/2"],THHN["14"]), 12, 0, "PES EMT chart")
check("10 THHN in 1/2 EMT", max_same_size(EMT40["1/2"],THHN["10"]), 5, 0, "PES EMT chart")
check("12 THHN in 1 PVC40", max_same_size(PVC40_40["1"],THHN["12"]), 25, 0, "PES PVC chart")
check("14 THHN in 3/4 PVC40 (Note 7 round-up)", max_same_size(PVC40_40["3/4"],THHN["14"]), 21, 0, "Note 7 math; PES shows 20")
check("#12 that fit in 1-1/4 RMC after 12x#10", math.floor((RMC40["1-1/4"]-12*.0211)/THHN["12"]), 26, 0, "ICC/Holt sample 8950P229")
mix = 3*THHN["2"]+THHN["4"]+THHN["8"]
check("Mixed 3x2+4+8 THHN area", mix, .4664, .0001, "open-exam-prep worked ex.1")
check("Mixed 3x2+4+8 -> smallest EMT", next(k for k,v in EMT40.items() if v>=mix), "1-1/4", 0, "Table 4 40% col")
check("3x4 + 1x8 THHN -> smallest EMT", next(k for k,v in EMT40.items() if v>=3*THHN["4"]+THHN["8"]), "1", 0, "open-exam-prep (MN)")

# Ohm's law
check("V=IR 2A x 60ohm", 2*60, 120, 0, "definition")
check("I=V/R 120V/12ohm", 120/12, 10, 0, "definition")
check("P=V^2/R 240V/9.6ohm (2500W heater)", 240**2/23.04, 2500, .01, "definition")
check("R of 200ft 12Cu (Table 8)", R_DC_CU["12"]*200/1000, .396, .0005, "Mike Holt sample 8.2")
check("I^2R loss 20A thru .396ohm", 20**2*.396, 158.4, .01, "definition")

# Wire size / ampacity
check("30A Cu 75C term", min_size_for_load("cu",30,75), "10", 0, "Table 310.16 + 240.4(D)")
check("20A Cu 75C (240.4D blocks 14)", min_size_for_load("cu",20,75), "12", 0, "240.4(D)")
check("50A Cu 60C (<=100A default)", min_size_for_load("cu",50,60), "6", 0, "110.14(C)(1)(a)")
check("100A Al 75C", min_size_for_load("al",100,75), "1", 0, "Table 310.16")
check("200A Cu 75C", min_size_for_load("cu",200,75), "3/0", 0, "Cerrowire VD table ***")
check("6 THHN 90C x .91 ambient, capped at 75C", min(ampacity("cu","6",90,.91), ampacity("cu","6",75)), 65, 0, "ecalpro worked example")
check("9 x 12 THHN bundled (90C col x .70)", ampacity("cu","12",90,1.0,9), 21, .01, "PES / Table 310.15(C)(1)")
check("6 AWG Cu 90C column", AMP_CU["6"][2], 75, 0, "WireRef")
check("4/0 Cu 60/75/90", AMP_CU["4/0"], (195,230,260), 0, "Encore (via search snippet)")
check("500 Cu 60/75/90", AMP_CU["500"], (320,380,430), 0, "aboutdarwin table")
check("350 Al 60/75/90", AMP_AL["350"], (210,250,280), 0, "aboutdarwin table")

# Amps <-> watts
check("1ph 240V 30A pf1", watts(240,30,1), 7200, 0, "definition")
check("3ph 480V 14A pf.85", watts(480,14,3,.85), 9893.5, 1, "definition")
check("3ph 480V 15kW -> A (pf1)", amps_from_watts(15000,480,3), 18.04, .01, "PDHonline E426 (18 A)")
check("DC 12V 100W -> A", amps_from_watts(100,12), 8.333, .001, "definition")
check("1ph 120V 1500W -> A", amps_from_watts(1500,120,1), 12.5, 0, "definition")

# Generator
loads = [(600,600),(100,100),(700,2200)]   # furnace(listed run only), lamp, fridge
check("Murdoch's example, add-full-start", gen_size(loads,"add_full_start")[1], 3600, 0, "Murdoch's Ranch & Home")
check("same loads, Cummins convention", gen_size(loads)[1], 2900, 0, "Cummins method applied")
check("Locked-rotor A: 20hp code G 460V 3ph", 20*6.29*1000/(math.sqrt(3)*460), 157.9, .3, "Table 430.7(B) worked ex.")
check("Locked-rotor A: 2hp code G 240V 1ph", 2*6.29*1000/240, 52.42, .01, "Mike Holt forum")
check("445.13: 20kW 240V 1ph nameplate x115%", 20000/240*1.15, 95.83, .01, "445.13 (115%)")

# Cerrowire 120V/240V 3% table (steel conduit, pf .9) vs our min-size logic
def cerro_min(material, amps, feet, volts, term_c):
    s0 = min_size_for_load(material, amps, term_c)
    tbl = AMP_CU if material=="cu" else AMP_AL
    keys = list(tbl.keys())
    for s in keys[keys.index(s0):]:
        if vd_table9(material,s,amps,feet,1,.9,"steel") <= .03*volts:
            return s
rows = [("cu",15,120,60,["14","12","10","8","6"]),("cu",20,120,60,["12","12","8","6","4"]),
        ("cu",30,120,60,["10","10","6","4","4"]),("cu",100,120,60,["1","1","1","2/0","4/0"]),
        ("al",100,120,60,["1/0","1/0","2/0","4/0","300"]),("cu",200,120,75,["3/0","3/0","3/0","300","500"]),
        ("al",200,120,75,["250","250","300","600",None]),
        ("cu",15,240,60,["14","14","12","10","10"]),("cu",20,240,60,["12","12","10","10","8"]),
        ("cu",30,240,60,["10","10","10","8","6"]),("al",30,240,60,["8","8","8","6","4"]),
        ("cu",40,240,75,["8","8","8","6","4"]),("cu",50,240,60,["6","6","6","6","4"])]
cerro=[]
for mat,a,v,tc,exp in rows:
    for ft,e in zip([25,50,100,150,200],exp):
        if e is None: continue
        got = cerro_min(mat,a,ft,v,tc)
        cerro.append((f"{mat} {a}A {v}V {ft}ft", got, e, "MATCH" if got==e else "DIFF"))

if __name__=="__main__":
    for t in T: print(" | ".join(map(str,t)))
    print("tests:", sum(t[3]=="PASS" for t in T), "/", len(T))
    for c in cerro: print(" | ".join(map(str,c)))
    print("cerrowire matches:", sum(c[3]=="MATCH" for c in cerro), "/", len(cerro))
