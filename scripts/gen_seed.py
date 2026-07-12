"""Generate fresh appdata.json from the ESE Civil Engineering syllabus structure."""
import json, uuid, time, sys

def uid():
    return str(uuid.uuid4())

NOW = int(time.time() * 1000)

SYLLABUS = [
    {
        "name": "Building Materials", "color": "#eab308", "icon": "Boxes",
        "chapters": [
            {"name": "Stones, Bricks, Metals & Composites", "topics": [
                "Stone — classification, properties & selection criteria",
                "Bricks — types, composition, properties & tests",
                "Lime — types, properties & uses",
                "Glass — properties & applications",
                "Steel — classification, properties & structural use",
                "Aluminium — properties & applications",
                "FRP, Ceramics & Plastics — properties & use",
                "Fly Ash — classification, properties & use",
                "Aggregates — classification, properties & selection",
                "Timber — classification, properties & selection",
            ]},
            {"name": "Cement, Mortar & Admixtures", "topics": [
                "Cement — types, composition, properties & uses",
                "Cement specifications & various tests",
                "Basic Admixtures — types and applications",
                "Lime Mortar — properties & tests",
                "Cement Mortar — properties & tests",
            ]},
            {"name": "Concrete Technology & Mix Design", "topics": [
                "Concrete — properties in fresh and hardened state",
                "Various tests on concrete",
                "Design of Concrete Mixes — proportioning of aggregates",
                "Methods of concrete mix design (IS, ACI, DOE)",
                "Special concretes — high-strength, self-compacting, light-weight",
            ]},
        ],
    },
    {
        "name": "Solid Mechanics", "color": "#ef4444", "icon": "Dumbbell",
        "chapters": [
            {"name": "Stress, Strain & Elastic Constants", "topics": [
                "Elastic constants — E, G, K, Poisson's ratio & their relationships",
                "Stress and plane stress — normal & shear",
                "Strains and plane strain",
                "Mohr's circle of stress and strain",
                "Principal stresses and principal planes",
            ]},
            {"name": "Theories of Failure", "topics": [
                "Maximum Principal Stress Theory (Rankine)",
                "Maximum Shear Stress Theory (Tresca)",
                "Maximum Strain Energy Theory (Beltrami)",
                "Distortion Energy Theory (Von Mises)",
                "Maximum Principal Strain Theory (Saint-Venant)",
            ]},
            {"name": "Bending, Shear & Torsion", "topics": [
                "Bending stress in beams — theory of simple bending",
                "Shear stress distribution in beams",
                "Torsion in circular shafts — solid and hollow",
                "Combined bending and torsion",
                "Deflection of beams — double integration & Macaulay's method",
            ]},
        ],
    },
    {
        "name": "Structural Analysis", "color": "#f97316", "icon": "Building2",
        "chapters": [
            {"name": "Strength of Materials Basics", "topics": [
                "Basics of strength of materials",
                "Types of stresses and strains",
                "Bending moments and shear force — diagrams for standard loads",
                "Concept of bending stresses and shear stresses in beams",
                "Relationship between loading, SF and BM",
            ]},
            {"name": "Determinate Structures", "topics": [
                "Analysis of statically determinate structures",
                "Trusses — method of joints and method of sections",
                "Beams — simply supported, cantilever, overhanging",
                "Plane frames — analysis of determinate frames",
                "Three-hinged arches and cables",
                "Suspended cables",
            ]},
            {"name": "Indeterminate Structures", "topics": [
                "Analysis of statically indeterminate structures",
                "Rolling loads and Influence Lines for beams and trusses",
                "Unit load method (Virtual work principle)",
                "Slope-Deflection method",
                "Moment Distribution method",
                "Stiffness and Flexibility matrix methods",
                "Concepts and use of computer-aided design (SAP, STAAD)",
            ]},
            {"name": "Structural Dynamics", "topics": [
                "Free vibrations of single degree of freedom (SDOF) systems",
                "Forced vibrations of SDOF systems — resonance & damping",
                "Free and forced vibrations of multi-degree freedom (MDOF) systems",
                "Natural frequencies and mode shapes",
            ]},
        ],
    },
    {
        "name": "Design of Steel Structures", "color": "#64748b", "icon": "Frame",
        "chapters": [
            {"name": "Working Stress Method & Connections", "topics": [
                "Principles of Working Stress method (IS 800 — WSM)",
                "Design of bolted connections — riveted & bolted joints",
                "Design of welded connections",
                "Design of eccentric connections",
            ]},
            {"name": "Member Design", "topics": [
                "Design of tension members",
                "Design of compression members (columns)",
                "Design of beams — laterally supported & unsupported",
                "Design of beam-columns",
                "Design of built-up sections and plate girders",
            ]},
            {"name": "Advanced Design & Roofs", "topics": [
                "Design of industrial roofs — trusses & purlins",
                "Principles of Ultimate Load Design (Plastic Design)",
                "Plastic hinges and plastic moment capacity",
                "Load factor and collapse mechanisms",
            ]},
        ],
    },
    {
        "name": "Design of Concrete & Masonry Structures", "color": "#10b981", "icon": "Building",
        "chapters": [
            {"name": "Limit State Design — Basics", "topics": [
                "Limit State philosophy — LSM vs WSM",
                "Limit State of Strength — flexure, shear, axial compression",
                "Limit State of Serviceability — deflection, cracking",
                "Design for combined forces — axial + bending",
                "IS 456 codal provisions",
            ]},
            {"name": "RCC Member Design", "topics": [
                "Design of singly and doubly reinforced beams",
                "Design of one-way and two-way slabs",
                "Design of columns — short and slender",
                "Design of lintels and staircases",
                "Design of footings — isolated and combined",
                "Design of retaining walls and water tanks",
            ]},
            {"name": "Prestressed Concrete", "topics": [
                "Principles of Prestressed Concrete Design",
                "Materials — high-strength concrete & steel for prestressing",
                "Pre-tensioning and post-tensioning methods",
                "Losses in prestress",
                "Design of prestressed beams",
            ]},
            {"name": "Earthquake Resistant Design & Masonry", "topics": [
                "Earthquake resistant design of structures (IS 1893)",
                "Seismic zones and design philosophy",
                "Design of masonry structures (IS 1905)",
                "Load bearing masonry walls and piers",
                "Confined and reinforced masonry",
            ]},
        ],
    },
    {
        "name": "Construction Practice, Planning & Management", "color": "#8b5cf6", "icon": "HardHat",
        "chapters": [
            {"name": "Construction Planning & Equipment", "topics": [
                "Construction planning — stages and methods",
                "Construction equipment — earthmoving, concreting, lifting",
                "Site investigation — soil exploration & sub-surface study",
                "Site management — layout, storage & temporary works",
            ]},
            {"name": "Estimation, Tendering & Contracts", "topics": [
                "Estimation with project management tools",
                "Network analysis — PERT and CPM",
                "Analysis of rates of various types of works",
                "Tendering process — types of tenders",
                "Contract management — types & conditions of contract",
            ]},
            {"name": "Quality Control & Productivity", "topics": [
                "Quality control in construction",
                "Productivity improvement techniques",
                "Operation cost and value engineering",
                "Land acquisition process",
            ]},
            {"name": "Safety & Welfare", "topics": [
                "Labour safety — regulations and practices",
                "Safety planning and risk management on site",
                "Labour welfare — statutory provisions",
                "Environmental compliance on construction sites",
            ]},
        ],
    },
    {
        "name": "Flow of Fluids, Hydraulic Machines & Hydro Power", "color": "#06b6d4", "icon": "Droplets",
        "chapters": [
            {"name": "Fluid Mechanics & Flow Kinematics", "topics": [
                "Fluid properties — density, viscosity, surface tension, compressibility",
                "Dimensional analysis and modeling — Buckingham π theorem",
                "Fluid dynamics — flow kinematics and measurements",
                "Flow net — construction and applications",
                "Viscosity, boundary layer and control",
                "Drag and lift forces",
            ]},
            {"name": "Open Channel & Pipe Flow", "topics": [
                "Principles in open channel flow — uniform and non-uniform flow",
                "Flow controls — sluice gates, weirs, notches",
                "Hydraulic jump and surges",
                "Pipe networks — analysis and design",
                "Water hammer in pipe flow",
            ]},
            {"name": "Hydraulic Machines & Hydro Power", "topics": [
                "Various pumps — centrifugal, reciprocating, jet pumps",
                "Air vessels and their design",
                "Hydraulic turbines — types and classification",
                "Performance parameters of turbines",
                "Power house — classification and layout",
                "Storage and pondage for hydro power",
                "Control of supply and load regulation",
            ]},
        ],
    },
    {
        "name": "Hydrology & Water Resources Engineering", "color": "#0ea5e9", "icon": "CloudRain",
        "chapters": [
            {"name": "Hydrology", "topics": [
                "Hydrological cycle — components and processes",
                "Precipitation — measurement and analysis of rainfall",
                "Evaporation, transpiration and infiltration",
                "Streams and their gauging — stream flow measurement",
                "River morphology and channel patterns",
                "Ground water hydrology and well hydrology",
                "Floods — estimation, frequency analysis & management",
                "Droughts — types and management",
                "Capacity of reservoirs — sedimentation and trap efficiency",
            ]},
            {"name": "Water Resources Engineering", "topics": [
                "Multipurpose uses of water",
                "River basins and their potential",
                "Irrigation systems — types and water demand assessment",
                "Storage and their yields",
                "Water logging, canal and drainage design",
                "Gravity dams — design and stability",
                "Falls, weirs, energy dissipaters and barrages",
                "Distribution works, cross-drainage works and head-works",
                "Concepts in canal design, construction & maintenance",
                "River training works",
            ]},
        ],
    },
    {
        "name": "Environmental Engineering", "color": "#14b8a6", "icon": "Leaf",
        "chapters": [
            {"name": "Water Supply Engineering", "topics": [
                "Sources and estimation of water supply",
                "Quality standards and testing of water",
                "Physical, chemical & biological characteristics of water",
                "Pollutants in water and their effects",
                "Estimation of water demand",
                "Drinking water standards (IS 10500)",
                "Water treatment — coagulation, sedimentation, filtration, disinfection",
                "Water treatment plants — design and layout",
                "Water distribution networks — design and analysis",
                "Rural, industrial & institutional water supply",
            ]},
            {"name": "Waste Water Engineering", "topics": [
                "Planning & design of domestic waste water systems",
                "Sewage collection and disposal",
                "Plumbing systems",
                "Components and layout of sewerage system",
                "Sludge management — treatment, disposal & re-use",
                "Design of sewage treatment plants",
                "Industrial waste waters and treatment plants",
            ]},
            {"name": "Solid Waste Management", "topics": [
                "Sources & classification of solid wastes",
                "Planning and design of solid waste management systems",
                "Collection, transportation and disposal systems",
                "Sanitary landfill — design and operation",
                "Beneficial aspects — composting, energy recovery, recycling",
            ]},
            {"name": "Air, Noise Pollution & Ecology", "topics": [
                "Sources and types of air pollution",
                "Air quality standards and monitoring",
                "Noise pollution — sources, standards and control",
                "Ecological concepts and environmental impact assessment",
                "Environmental legislation — Water Act, Air Act, Environment Protection Act",
            ]},
        ],
    },
    {
        "name": "Geo-technical & Foundation Engineering", "color": "#a16207", "icon": "Mountain",
        "chapters": [
            {"name": "Geo-technical Engineering", "topics": [
                "Soil exploration — planning and methods",
                "Properties of soil — index properties, classification & tests",
                "Permeability & seepage — Darcy's law, flow nets",
                "Compressibility and consolidation — Terzaghi's theory",
                "Shearing resistance — Mohr-Coulomb criterion, tests",
                "Earth pressure theories — Rankine, Coulomb",
                "Stress distribution in soil — Boussinesq equation",
                "Properties and uses of geo-synthetics",
            ]},
            {"name": "Foundation Engineering", "topics": [
                "Types of foundations & selection criteria",
                "Bearing capacity of soils — Terzaghi & IS methods",
                "Settlement analysis — immediate, consolidation & secondary",
                "Design of shallow foundations — isolated, combined, raft",
                "Design and testing of deep foundations — piles and well foundations",
                "Slope stability analysis",
                "Design of earthen embankments, dams & earth retaining structures",
                "Principles of ground modifications — compaction, grouting, stone columns",
            ]},
        ],
    },
    {
        "name": "Surveying & Geology", "color": "#3b82f6", "icon": "Compass",
        "chapters": [
            {"name": "Surveying", "topics": [
                "Classification of surveys and various methodologies",
                "Instruments and analysis of measurement of distances, elevation & directions",
                "Chain surveying and compass traversing",
                "Levelling — types and methods",
                "Theodolite surveying — horizontal and vertical angles",
                "Plane table surveying",
                "Field astronomy — determination of meridian, azimuth & time",
                "Global Positioning System (GPS) and GNSS",
                "Map preparation — contours and topographic mapping",
                "Photogrammetry and remote sensing concepts",
                "Survey layout for culverts, canals, bridges, road/railway alignment & buildings",
                "Setting out of curves — simple, compound and reverse",
            ]},
            {"name": "Geology", "topics": [
                "Basic engineering geology — minerals and rocks",
                "Geological structures — folds, faults, joints and unconformities",
                "Geological maps and their interpretation",
                "Application of engineering geology in projects — dams, tunnels, foundations",
                "Rock mass classification — RMR and Q-system",
            ]},
        ],
    },
    {
        "name": "Transportation Engineering", "color": "#ec4899", "icon": "TrafficCone",
        "chapters": [
            {"name": "Highways", "topics": [
                "Planning & construction methodology — road development plans",
                "Alignment and geometric design — sight distance, horizontal & vertical curves",
                "Traffic surveys and controls — volume, speed & origin-destination studies",
                "Traffic signals and road markings",
                "Principles of flexible pavement design — CBR method, IRC guidelines",
                "Principles of rigid pavement design — Westergaard's theory",
                "Pavement materials — bitumen, aggregates & tests",
            ]},
            {"name": "Tunneling", "topics": [
                "Alignment of tunnels — factors governing selection",
                "Methods of construction — cut & cover, NATM, TBM",
                "Disposal of muck",
                "Drainage, lighting and ventilation of tunnels",
            ]},
            {"name": "Railway Systems", "topics": [
                "Railway terminology — gauge, gradient, curves",
                "Planning and design of railway tracks",
                "Maintenance practices — track geometry and defects",
                "Track modernization — high-speed corridors",
            ]},
            {"name": "Harbours & Airports", "topics": [
                "Harbour terminology — breakwaters, jetties, quays",
                "Harbour layouts and planning",
                "Airport layout — runway, taxiway, apron & terminal",
                "Airport planning and design — capacity and configuration",
                "Runway orientation — wind rose diagram",
            ]},
        ],
    },
    {
        "name": "General Studies & Engineering Aptitude", "color": "#6366f1", "icon": "Newspaper",
        "chapters": [
            {"name": "General Studies & Current Affairs", "topics": [
                "Current issues of national & international importance (social, economic, industrial)",
                "Ethics and values in the engineering profession",
                "Basics of Energy and Environment — conservation, pollution, climate change",
                "Environmental impact assessment",
            ]},
            {"name": "Engineering Aptitude & Mathematics", "topics": [
                "Logical Reasoning & Analytical Ability",
                "Engineering Mathematics — Linear Algebra",
                "Engineering Mathematics — Calculus & Differential Equations",
                "Engineering Mathematics — Probability & Statistics",
                "Numerical Analysis and numerical methods",
            ]},
            {"name": "Design, Standards & Project Management", "topics": [
                "General Principles of Design, Drawing & importance of Safety",
                "Standards and Quality practices in production, construction, maintenance & services",
                "Basics of Project Management — PERT/CPM, scheduling",
                "Basics of Material Science and Engineering",
                "ICT-based tools and their applications in engineering (networking, e-governance)",
            ]},
        ],
    },
]

BUILTIN_TAGS = [
    {"name": "Weak Area",      "color": "#ef4444", "icon": "AlertTriangle",  "description": "Topics that need more attention"},
    {"name": "Important",      "color": "#f97316", "icon": "Star",           "description": "High-yield topics for exam"},
    {"name": "Formula Heavy",  "color": "#eab308", "icon": "Calculator",     "description": "Topics with many formulas to memorise"},
    {"name": "Conceptual",     "color": "#06b6d4", "icon": "Lightbulb",      "description": "Understanding-based topics"},
    {"name": "Numerical",      "color": "#8b5cf6", "icon": "Hash",           "description": "Problem-solving topics"},
    {"name": "Diagram Based",  "color": "#10b981", "icon": "PenTool",        "description": "Topics needing diagrams"},
    {"name": "Revised",        "color": "#22c55e", "icon": "CheckCircle2",   "description": "Topics already well revised"},
    {"name": "Quick Revision", "color": "#3b82f6", "icon": "Zap",            "description": "Short topics for quick review"},
]

def build():
    subjects = {}
    chapters = {}
    topics = {}
    subject_order = []
    tags = {}
    tag_order = []

    for ti, tag_def in enumerate(BUILTIN_TAGS):
        tid = uid()
        tags[tid] = {
            "id": tid,
            "name": tag_def["name"],
            "color": tag_def["color"],
            "icon": tag_def["icon"],
            "description": tag_def.get("description", ""),
            "order": ti,
        }
        tag_order.append(tid)

    for si, subj in enumerate(SYLLABUS):
        sid = uid()
        chapter_ids = []
        for ci, ch in enumerate(subj["chapters"]):
            cid = uid()
            topic_ids = []
            for topi, title in enumerate(ch["topics"]):
                topid = uid()
                topics[topid] = {
                    "id": topid,
                    "chapterId": cid,
                    "title": title,
                    "notes": "",
                    "order": topi,
                    "difficulty": "Medium",
                    "priority": "Medium",
                    "revisionHistory": [],
                    "createdAt": NOW,
                    "updatedAt": NOW,
                }
                topic_ids.append(topid)
            chapters[cid] = {
                "id": cid,
                "subjectId": sid,
                "name": ch["name"],
                "order": ci,
                "difficulty": "Medium",
                "priority": "Medium",
                "topicIds": topic_ids,
            }
            chapter_ids.append(cid)
        subjects[sid] = {
            "id": sid,
            "name": subj["name"],
            "color": subj["color"],
            "icon": subj["icon"],
            "order": si,
            "chapterIds": chapter_ids,
        }
        subject_order.append(sid)

    return {
        "subjects": subjects,
        "chapters": chapters,
        "topics": topics,
        "subjectOrder": subject_order,
        "tags": tags,
        "tagOrder": tag_order,
    }

if __name__ == "__main__":
    data = build()
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/new_appdata.json"
    with open(out, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    s = len(data["subjects"])
    c = len(data["chapters"])
    t = len(data["topics"])
    print(f"Generated: {s} subjects, {c} chapters, {t} topics → {out}")
